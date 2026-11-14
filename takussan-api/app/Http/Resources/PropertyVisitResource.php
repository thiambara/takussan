<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Policies\PropertyVisitPolicy;
use App\Rules\PersonnelDeLAgence;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Visit\ProprietaireHorsConsole;
use App\Services\Visit\VisitReadContext;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Illuminate\Support\Carbon;

class PropertyVisitResource extends BaseResource
{
    /**
     * TCK-2797 — les clés CALCULÉES, que `fields[property_visits]` peut nommer sans qu'elles soient des
     * colonnes : spatie ne les voit jamais ({@see requeteDesColonnes}, appelée par
     * `PropertyVisit::buildQuery()`), et la ressource ne les rend que nommées. Lue par la garde du
     * front `fields-demandables` : une liste à plat.
     */
    public const FIELDS = ['visitor_display', 'report', 'abilities'];

    /**
     * Les colonnes que `report` lit, mises au `SELECT` sans que l'appelant les demande.
     * `visitor_display` lit `VisitReadContext`, `abilities` la visite de la route : aucune.
     */
    private const COLONNES_DU_COMPTE_RENDU = ['reported_at', 'report_outcome', 'report_objections', 'report_note', 'report_follow_up', 'reported_by_id'];

    /** TCK-2797 — les blocs de relation suivent `include=`, pas `fields` (`whenLoaded`). */
    private const BLOCS_DE_RELATION = ['property', 'visitor', 'agent', 'customer'];

    /**
     * TCK-2797 — les clés que `fields[property_visits]` demande, `id` compris ; `null` sans `fields` :
     * la réponse entière. Lu dans la chaîne de requête D'ORIGINE (sur le modèle de
     * {@see AppNotificationResource::requestedFields()}), celle qui nomme encore les clés calculées.
     * Une clé demandée n'ouvre aucun droit : les règles de `toArray` jugent chaque valeur, le filtre
     * ne fait que retirer.
     *
     * @return list<string>|null
     */
    public static function requestedFields(Request $request): ?array
    {
        $noms = self::nomsDemandes($request);

        return $noms === null ? null : array_values(array_unique(['id', ...$noms]));
    }

    /**
     * TCK-2797 — la requête que spatie lit : les clés calculées retirées de `fields[property_visits]`,
     * remplacées par les colonnes qu'elles lisent, et `id` toujours au `SELECT` (`VisitReadContext`
     * relit la page par lui). Une copie : la requête d'origine garde les noms que la ressource lit
     * ensuite. Un nom inconnu reste à spatie, qui le refuse (400), comme avant.
     */
    public static function requeteDesColonnes(Request $request): Request
    {
        $noms = self::nomsDemandes($request);
        if ($noms === null) {
            return $request;
        }

        $colonnes = ['id'];
        foreach ($noms as $nom) {
            if ($nom === 'report') {
                array_push($colonnes, ...self::COLONNES_DU_COMPTE_RENDU);
            } elseif (! in_array($nom, self::FIELDS, true)) {
                $colonnes[] = $nom;
            }
        }
        $query = $request->query->all();
        $query['fields']['property_visits'] = implode(',', array_values(array_unique($colonnes)));

        return $request->duplicate($query);
    }

    /** @return list<string>|null */
    private static function nomsDemandes(Request $request): ?array
    {
        $fields = $request->query('fields');
        $brut = is_array($fields) ? ($fields['property_visits'] ?? null) : null;
        if (! is_string($brut)) {
            return null;
        }
        $noms = array_values(array_filter(array_map('trim', explode(',', $brut)), fn (string $nom) => $nom !== ''));

        return $noms === [] ? null : $noms;
    }

    public function toArray(Request $request): array
    {
        $tout = $this->toutesLesCles($request);
        $demandes = self::requestedFields($request);
        if ($demandes === null) {
            return $tout;
        }

        // TCK-2797 — `id`, les clés nommées, et les blocs que `include=` a chargés.
        return array_intersect_key($tout, array_flip([...$demandes, ...self::BLOCS_DE_RELATION]));
    }

    /** @return array<string, mixed> */
    private function toutesLesCles(Request $request): array
    {
        $fiche = $this->ficheClientLisible($request);
        // Passe 4 (M7″) — planifier pour une fiche recopie son nom, son téléphone et son e-mail
        // dans `visitor_*` : sans la fiche, ils ne se lisent pas davantage par là. Une visite sans
        // fiche (demande publique) garde les siens. TCK-696 (P21.03) — même règle pour le bloc
        // `visitor` : une fiche liée à un compte pose `visitor_id` sur ce compte, et son nom, son
        // e-mail et son téléphone sortiraient sinon par `include=visitor`.
        // TCK-2779 — jugé sur la fiche RELUE : sous `fields[property_visits]` sans `customer_id`, la
        // ligne rendue la disait absente et rendait `visitor_*` au bailleur.
        $relue = $this->identiteRelue($request);
        $visiteurLisible = $fiche || ($relue !== null && $relue['customer_id'] === null);
        // TCK-2797 — `report` ne sort que nommé dans `fields`, et le nommer met `reported_at` et
        // `report_*` au `SELECT` ({@see COLONNES_DU_COMPTE_RENDU}) : le cas « absent faute de `reported_at` »
        // de TCK-2779 n'existe plus.
        $rapportLisible = $this->compteRenduLisible($request);

        return [
            'id' => $this->id,
            'property_id' => $this->property_id,
            'visitor_id' => $this->visitor_id,
            'customer_id' => $fiche ? $this->customer_id : null,
            'agent_id' => $this->agent_id,
            'visitor_name' => $visiteurLisible ? $this->visitor_name : null,
            'visitor_phone' => $visiteurLisible ? $this->visitor_phone : null,
            'visitor_email' => $visiteurLisible ? $this->visitor_email : null,
            'type' => $this->type?->value,
            'status' => $this->status?->value,
            'scheduled_at' => $this->iso($this->scheduled_at),
            // TCK-2502 — posée, `scheduled_at` n'est que le début de la tranche : l'heure reste à fixer.
            'preferred_window' => $this->enumValue($this->preferred_window),
            'completed_at' => $this->iso($this->completed_at),
            'cancelled_at' => $this->iso($this->cancelled_at),
            'cancellation_reason' => $this->cancellation_reason,
            'duration_minutes' => $this->duration_minutes,
            'feedback' => $this->feedback,
            'rating' => $this->rating !== null ? (float) $this->rating : null,
            // TCK-2587 (lot C, reprise) — `notes` a DEUX auteurs : le message d'une demande publique
            // (le visiteur) et la note de planification du personnel (« Code du portail, étage,
            // personne à demander… », `PlanifierUneVisite`). Rien ne dit qui a écrit une ligne : elle
            // suit donc la règle des outils de la console, comme `metadata` — clé ABSENTE pour le
            // visiteur, le client de la fiche et le bailleur d'un bien d'agence. Aucun écran du client
            // ne la lit (« Mes visites », l'avis).
            'notes' => $this->when($this->outilDeLaConsole($request), fn () => $this->notes),
            // Constat de TCK-2581 — la `metadata` porte l'avis de l'agence (`feedback_agent`, texte
            // libre), celui du visiteur et les marques des rappels : un outil de la console, servi
            // comme `visitor_display` ({@see outilDeLaConsole}). Clé ABSENTE pour le visiteur, le
            // client et le bailleur d'un bien d'agence ; l'avis du visiteur lui reste lisible par
            // `feedback` et `rating`.
            'metadata' => $this->when($this->outilDeLaConsole($request), fn () => $this->metadata),
            'property' => $this->whenLoaded('property', fn () => $this->property === null ? null : [
                'id' => $this->property->id,
                'title' => $this->property->title,
                'slug' => $this->property->slug,
                // TCK-2585 — la photo du bien, par le seul chemin des URL publiques (jamais l'original,
                // filigrane respecté) ; l'adresse, au personnel et au propriétaire toujours, au
                // visiteur une fois la visite confirmée (décision du porteur du 2026-11-10, § 1.3) :
                // clé ABSENTE sinon.
                'cover_url' => ($media = $this->property->getFirstMedia('photos')) !== null
                    ? PublicPhotoUrl::upTo($media, 'preview', fn () => $this->property->requiresWatermark())
                    : null,
                ...($this->adresseLisible($request) ? ['address' => self::adresse($this->property)] : []),
            ]),
            // TCK-2585 — le visiteur tel que la carte le montre : la fiche, à défaut le compte, à défaut
            // le nom saisi ; « 1re visite » ou « revient » (`visits_on_property`, celle-ci comprise).
            // Masqué comme `visitor_name` : `null` quand la fiche n'est pas lisible.
            'visitor_display' => $this->visitorDisplay($request),
            'visitor' => $this->whenLoaded('visitor', fn () => $visiteurLisible && $this->visitor ? [
                'id' => $this->visitor->id,
                'first_name' => $this->visitor->first_name,
                'last_name' => $this->visitor->last_name,
                'email' => $this->visitor->email,
                'phone' => $this->visitor->phone,
            ] : null),
            'agent' => $this->whenLoaded('agent', fn () => $this->agent ? [
                'id' => $this->agent->id,
                'first_name' => $this->agent->first_name,
                'last_name' => $this->agent->last_name,
            ] + $this->contactDeLAgent($request) : null),
            'customer' => $this->whenLoaded('customer', fn () => $fiche && $this->customer ? [
                'id' => $this->customer->id,
                'user_id' => $this->customer->user_id,
                'first_name' => $this->customer->first_name,
                'last_name' => $this->customer->last_name,
                'email' => $this->customer->email,
                'phone' => $this->customer->phone,
            ] : null),
            // TCK-2578 (ADR-0101 § 2) — le compte rendu de l'agence : clé ABSENTE hors du personnel de
            // l'agence du bien (visiteur, client, bailleur), en détail comme en liste.
            'report' => $this->when($rapportLisible, fn (): ?array => $this->reported_at === null ? null : [
                'outcome' => $this->enumValue($this->report_outcome),
                'objections' => array_values($this->report_objections ?? []),
                'note' => $this->report_note,
                'follow_up' => $this->enumValue($this->report_follow_up),
                'reported_at' => $this->iso($this->reported_at),
                'reported_by' => $this->relationLoaded('reportedBy') && $this->reportedBy !== null ? [
                    'id' => $this->reportedBy->id,
                    'first_name' => $this->reportedBy->first_name,
                    'last_name' => $this->reportedBy->last_name,
                ] : ($this->reported_by_id !== null ? ['id' => $this->reported_by_id] : null),
            ]),
            'created_at' => $this->iso($this->created_at),
            // P152.04 — sur LA visite de la route seulement (une batterie de règles par ligne d'une
            // liste coûterait) : {@see PropertyVisitPolicy::gere()}.
            'abilities' => $this->when($this->isDetailRequest($request), fn (): array => [
                'manage' => PropertyVisitPolicy::gere($request->user(), $this->resource),
                // Vérification de TCK-2581 — déposer l'avis du VISITEUR : le `$isCustomer` de
                // `PropertyVisitController::feedback`, le visiteur (`visitor_id`) ou le client
                // rattaché par la fiche (`customer.user_id`). Le front le déduisait de `customer`,
                // que l'API masque au client rattaché par la seule fiche ({@see ficheClientLisible}) :
                // un booléen, plutôt que la fiche. Ni la fenêtre ni le statut n'y entrent : le front
                // les juge à part (`isFeedbackOpen`), l'API les refuse en 422.
                'feedback_customer' => $this->lecteurEstLeDemandeur($request),
                // TCK-2716 — « Créer sa fiche » : vrai exactement quand `POST /api/customers` avec
                // `property_visit_id` réussirait pour ce lecteur (le même prédicat). Le front ne
                // préremplit et n'offre le geste que sur lui, jamais sur `visitor_display`.
                'create_customer' => PropertyVisitPolicy::refusDeLaFicheDepuisLaVisite($request->user(), $this->resource) === null,
            ]),
        ];
    }

    /**
     * TCK-2585 — l'adresse d'un bien, sous la forme de la carte du lieu.
     *
     * @return array{line: ?string, neighborhood: ?string, city: ?string, latitude: ?float, longitude: ?float}|null
     */
    public static function adresse(Property $property): ?array
    {
        $address = $property->address;
        if ($address === null) {
            return null;
        }

        return [
            'line' => $address->street,
            'neighborhood' => $address->neighborhood,
            'city' => $address->city,
            'latitude' => $address->latitude !== null ? (float) $address->latitude : null,
            'longitude' => $address->longitude !== null ? (float) $address->longitude : null,
        ];
    }

    /**
     * TCK-2585 — qui lit l'adresse du bien d'une visite : le super-admin, le personnel actif de
     * l'agence du bien, le propriétaire du bien ; tout autre lecteur de la visite (le visiteur, le
     * client de la fiche) seulement une fois la visite confirmée. Jugé sur les valeurs RELUES
     * (`VisitReadContext`) : sous sparse fieldsets, l'agence, le propriétaire et le statut peuvent
     * manquer à la ligne rendue. Rien de connu : fermé.
     */
    private function adresseLisible(Request $request): bool
    {
        $user = $request->user();
        if ($user === null) {
            return false;
        }
        if ($user->isSuperAdmin()) {
            return true;
        }

        $ctx = VisitReadContext::for($request, $this->resource);
        if ($ctx === null) {
            return false;
        }
        if ($ctx['owner_id'] !== null && $ctx['owner_id'] === (int) $user->id) {
            return true;
        }
        if ($ctx['agency_id'] !== null && $this->personnelDe($request, $ctx['agency_id'])) {
            return true;
        }

        return $ctx['status'] === VisitStatus::Confirmed->value;
    }

    /**
     * TCK-2585 — la carte du visiteur est un outil de la console : au super-admin, au personnel actif
     * de l'agence du bien, au propriétaire d'un bien sans agence — comme `visits_on_property` d'une
     * réservation (TCK-2593). Jugé sur les valeurs RELUES : la ligne rendue peut ne porter ni la
     * fiche ni l'agence.
     *
     * TCK-2717 — et, sous une forme RÉDUITE, au propriétaire du bien hors console
     * ({@see ProprietaireHorsConsole}) sur une visite SANS fiche : ce que `visitor_*` lui montrent déjà
     * (le nom et le numéro saisis), jamais plus — ni la fiche, ni `kind: 'customer'`, ni le rang de
     * visite (`visits_on_property` nul : il relie des visites qu'il ne voit pas comme une même
     * personne). Un prédicat distinct de celui de la `metadata`, qui reste à la console. `null` pour
     * tout autre lecteur (le visiteur et le client compris), et pour ce propriétaire sur une visite à
     * fiche.
     *
     * @return array{name: ?string, phone: ?string, kind: string, visits_on_property: ?int}|null
     */
    private function visitorDisplay(Request $request): ?array
    {
        if (! $this->outilDeLaConsole($request)) {
            $user = $request->user();
            $ctx = $user !== null ? VisitReadContext::for($request, $this->resource) : null;
            if ($ctx === null || $ctx['customer_id'] !== null
                || ! ProprietaireHorsConsole::est($user, $ctx['owner_id'], $ctx['agency_id'])) {
                return null;
            }

            return [
                'name' => $ctx['visitor_name'],
                'phone' => $ctx['visitor_phone'],
                'kind' => $ctx['visitor_id'] !== null ? 'account' : 'anonymous',
                'visits_on_property' => null,
            ];
        }
        $ctx = VisitReadContext::for($request, $this->resource);

        return [
            'name' => $ctx['customer_name'] ?? $ctx['visitor_name'],
            'phone' => $ctx['visitor_phone'] ?? $ctx['customer_phone'],
            'kind' => $ctx['customer_id'] !== null ? 'customer' : ($ctx['visitor_id'] !== null ? 'account' : 'anonymous'),
            'visits_on_property' => $ctx['visits_on_property'],
        ];
    }

    /**
     * Ce qui n'appartient qu'à ceux qui gèrent la visite — la carte du visiteur (TCK-2585) et la
     * `metadata` (constat de TCK-2581) : le super-admin, le personnel actif de l'agence du bien, le
     * propriétaire d'un bien sans agence. Jugé sur les valeurs RELUES (`VisitReadContext`) : la ligne
     * rendue peut ne porter ni l'agence ni le propriétaire. Rien de connu : fermé.
     */
    private function outilDeLaConsole(Request $request): bool
    {
        $user = $request->user();
        $ctx = $user !== null ? VisitReadContext::for($request, $this->resource) : null;
        if ($ctx === null) {
            return false;
        }

        return $user->isSuperAdmin()
            || ($ctx['agency_id'] !== null
                ? $this->personnelDe($request, $ctx['agency_id'])
                : $ctx['owner_id'] === (int) $user->id);
    }

    /**
     * Le lecteur est le visiteur ou le client de la fiche, jugé sur les valeurs RELUES
     * (`VisitReadContext`, une requête pour la page) : la ligne rendue peut ne porter ni
     * `visitor_id` ni la fiche. Rien de connu : faux.
     */
    private function lecteurEstLeDemandeur(Request $request): bool
    {
        $user = $request->user();
        $ctx = $user !== null ? VisitReadContext::for($request, $this->resource) : null;
        if ($ctx === null) {
            return false;
        }
        $moi = (int) $user->getKey();

        return $ctx['visitor_id'] === $moi || $ctx['customer_user_id'] === $moi;
    }

    /**
     * TCK-2587 (lot C, décision a) du team-lead, confirmée par le porteur) — le visiteur d'une visite
     * CONFIRMÉE et À VENIR joint son agent : `phone`, `phone_whatsapp` et le nom de l'agence. Un
     * contact professionnel, au SEUL demandeur (le visiteur, ou le compte de sa fiche) ; clés ABSENTES
     * pour tout autre lecteur (le personnel garde ce qu'il voit déjà), et pour une visite en attente,
     * annulée, close, manquée ou passée.
     *
     * Le numéro : il n'existe aucun numéro professionnel (ni le profil agent ni l'adhésion n'en
     * portent) ; c'est donc celui du compte, sous la règle de toute surface tournée vers l'extérieur,
     * `User::numeroPrincipalPublic()` puis `numeroSecondairePublic()` — un numéro non vérifié n'est
     * servi nulle part. Aucun : `phone` à `null`, et le front ne montre pas le geste. Un agent qui n'est
     * plus du personnel actif de l'agence du bien (parti, suspendu) n'est pas joint par là.
     *
     * Jugé sur les valeurs RELUES (`VisitReadContext`) : sous sparse fieldsets, ni le statut, ni l'heure,
     * ni l'agence ne sont garantis à la ligne rendue. Rien de connu : fermé.
     *
     * @return array{phone?: ?string, phone_whatsapp?: bool, agency_name?: ?string}
     */
    private function contactDeLAgent(Request $request): array
    {
        $user = $request->user();
        $ctx = $user !== null ? VisitReadContext::for($request, $this->resource) : null;
        if ($ctx === null || ! self::contactServi($ctx, (int) $user->getKey())) {
            return [];
        }

        return self::contactsDesAgents($request, (int) $user->getKey())[$ctx['agent_id'].':'.$ctx['agency_id']] ?? [];
    }

    /**
     * La visite ouvre-t-elle le contact de son agent à ce lecteur : confirmée, à venir, un agent et
     * une agence connus, et le lecteur est le demandeur (visiteur, ou compte de la fiche).
     *
     * @param  array<string, mixed>  $ctx  une ligne de {@see VisitReadContext}
     */
    private static function contactServi(array $ctx, int $moi): bool
    {
        return $ctx['agent_id'] !== null && $ctx['agency_id'] !== null && $ctx['scheduled_at'] !== null
            && $ctx['status'] === VisitStatus::Confirmed->value
            && Carbon::parse($ctx['scheduled_at'])->isFuture()
            && ($ctx['visitor_id'] === $moi || $ctx['customer_user_id'] === $moi);
    }

    /**
     * Vérification du lot C (constat c) — le contact de chaque couple (agent, agence) des visites
     * ÉLIGIBLES de la page, lu en une passe : les agents en une requête, les noms d'agence en une, le
     * personnel sous l'amorce de {@see MembershipCapabilityResolver::primed()}. C'était trois lectures
     * par ligne (l'agent, son statut de personnel — plusieurs requêtes de profils —, l'agence).
     *
     * L'agent est un TIERS : il se juge par {@see PersonnelDeLAgence::estPersonnel()}, sur TOUTES ses
     * agences, et non par `personnelActifDe()`, prédicat de l'APPELANT qui lit l'agence de son profil
     * actif — un agent également bailleur ailleurs n'en a pas, et n'était plus joint.
     *
     * Retenu par requête (comme `visits.staff_of`) : rien n'en survit à la réponse.
     *
     * @return array<string, array{phone?: ?string, phone_whatsapp?: bool, agency_name?: ?string}>
     */
    private static function contactsDesAgents(Request $request, int $moi): array
    {
        $connus = $request->attributes->get('visits.agent_contacts', []);

        $couples = [];
        foreach (VisitReadContext::rows($request) as $ctx) {
            if (! self::contactServi($ctx, $moi)) {
                continue;
            }
            $cle = $ctx['agent_id'].':'.$ctx['agency_id'];
            if (! array_key_exists($cle, $connus)) {
                $couples[$cle] = [(int) $ctx['agent_id'], (int) $ctx['agency_id']];
            }
        }
        if ($couples === []) {
            return $connus;
        }

        $agentIds = array_values(array_unique(array_column($couples, 0)));
        $agencyIds = array_values(array_unique(array_column($couples, 1)));
        $agents = User::query()->whereIn('id', $agentIds)->get()->keyBy('id');
        $noms = Agency::query()->whereIn('id', $agencyIds)->pluck('name', 'id');

        $personnel = MembershipCapabilityResolver::primed($agentIds, $agencyIds, fn (): array => array_map(
            fn (array $couple): bool => PersonnelDeLAgence::estPersonnel($agents->get($couple[0]), $couple[1]),
            $couples,
        ));

        foreach ($couples as $cle => [$agentId, $agencyId]) {
            $agent = $agents->get($agentId);
            if ($agent === null || ! $personnel[$cle]) {
                $connus[$cle] = [];

                continue;
            }
            $principal = $agent->numeroPrincipalPublic();
            $second = $principal === null ? $agent->numeroSecondairePublic() : null;
            $connus[$cle] = [
                'phone' => $principal ?? $second,
                'phone_whatsapp' => $principal !== null ? (bool) $agent->phone_whatsapp
                    : ($second !== null && (bool) $agent->secondary_phone_whatsapp),
                'agency_name' => $noms->get($agencyId),
            ];
        }
        $request->attributes->set('visits.agent_contacts', $connus);

        return $connus;
    }

    /** Personnel actif de l'agence, jugé une fois par agence et par requête (comme le compte rendu). */
    private function personnelDe(Request $request, int $agencyId): bool
    {
        $personnelDe = $request->attributes->get('visits.staff_agencies');
        if (is_array($personnelDe)) {
            return in_array($agencyId, $personnelDe, true);
        }

        $user = $request->user();
        $verdicts = $request->attributes->get('visits.staff_of', []);
        if (! array_key_exists($agencyId, $verdicts)) {
            $verdicts[$agencyId] = $user !== null && PersonnelDeLAgence::personnelActifDe($user, $agencyId);
            $request->attributes->set('visits.staff_of', $verdicts);
        }

        return $verdicts[$agencyId];
    }

    private function isDetailRequest(Request $request): bool
    {
        $route = $request->route();
        if ($request->user() === null || ! $route instanceof Route || ! $route->hasParameter('visit')) {
            return false;
        }
        $routed = $route->parameter('visit');

        return $routed instanceof PropertyVisit && $routed->is($this->resource);
    }

    /**
     * TCK-2578 (ADR-0101 § 2) — la règle de `PropertyVisitPolicy::report` (super-admin, personnel
     * actif de l'agence du bien), jugée sans relire le bien ligne par ligne : l'agence du bien vient
     * de {@see identiteRelue} (TCK-2779), l'index pose `visits.staff_agencies` ; ailleurs, le verdict est retenu par
     * agence pour la requête (`visits.staff_of`, partagé avec la fiche client). Un bien sans agence
     * n'a pas de compte rendu : rien n'est servi.
     */
    private function compteRenduLisible(Request $request): bool
    {
        $user = $request->user();
        if ($user === null) {
            return false;
        }
        if ($user->isSuperAdmin()) {
            return true;
        }

        // TCK-2779 — l'agence du bien RELUE : sous `fields[property_visits]` sans `property_id`, la
        // ligne ne la portait plus.
        $ctx = $this->identiteRelue($request);
        if ($ctx === null || ! $ctx['property_live']) {
            return false;
        }
        $agencyId = $ctx['agency_id'];

        if ($agencyId === null) {
            return false;
        }

        $personnelDe = $request->attributes->get('visits.staff_agencies');
        if (is_array($personnelDe)) {
            return in_array((int) $agencyId, $personnelDe, true);
        }

        $verdicts = $request->attributes->get('visits.staff_of', []);
        if (! array_key_exists((int) $agencyId, $verdicts)) {
            $verdicts[(int) $agencyId] = PersonnelDeLAgence::personnelActifDe($user, $agencyId);
            $request->attributes->set('visits.staff_of', $verdicts);
        }

        return $verdicts[(int) $agencyId];
    }

    /**
     * TCK-590 (vérification adverse, passe 3 M7′) — la fiche client est du CRM : sur un bien
     * d'agence, seul le personnel de l'agence la lit. Le propriétaire reconnu
     * (`PrimaryPropertyContact::estProprietaire`) voit la visite, sans `customer` ni `customer_id`,
     * comme le non-personnel qui planifie pour lui-même (B1). Le visiteur garde l'identifiant de
     * sa propre fiche. Un bien sans agence n'a pas de CRM d'agence : rien à masquer.
     *
     * L'agence de chaque bien vient de {@see identiteRelue} (TCK-2779, une requête pour la page) et
     * l'index pose les agences où le lecteur est personnel (`visits.staff_agencies`) : rien n'est
     * relu ligne par ligne.
     * Ailleurs, le verdict est retenu par agence pour la requête.
     *
     * Passes 4 et 5 (X1, X1′) — le personnel est jugé par `PersonnelDeLAgence::personnelActifDe`
     * (compte joignable, agence du profil actif), la définition de `PropertyVisitPolicy::view`.
     */
    private function ficheClientLisible(Request $request): bool
    {
        // TCK-2779 — la fiche, le visiteur et l'agence du bien RELUS ({@see identiteRelue}) : la
        // ligne rendue sous `fields[property_visits]` peut ne porter ni `customer_id`, ni
        // `visitor_id`, ni `property_id`, et `customer_id` absent se lisait « sans fiche » — ouvert.
        $ctx = $this->identiteRelue($request);
        if ($ctx === null) {
            return false;
        }
        if ($ctx['customer_id'] === null) {
            return true;
        }

        $user = $request->user();
        if ($user === null) {
            return false;
        }

        if ($user->isSuperAdmin() || $ctx['visitor_id'] === $user->id) {
            return true;
        }

        if (! $ctx['property_live']) {
            return false;
        }
        $agencyId = $ctx['agency_id'];

        if ($agencyId === null) {
            return true;
        }

        $agences = $request->attributes->get('visits.staff_agencies');
        if (is_array($agences)) {
            return in_array((int) $agencyId, $agences, true);
        }

        $verdicts = $request->attributes->get('visits.staff_of', []);
        if (! array_key_exists((int) $agencyId, $verdicts)) {
            $verdicts[(int) $agencyId] = PersonnelDeLAgence::personnelActifDe($user, $agencyId);
            $request->attributes->set('visits.staff_of', $verdicts);
        }

        return $verdicts[(int) $agencyId];
    }

    /**
     * TCK-2779 — la fiche, le visiteur et le bien de la visite, tels que la BASE les porte : la ligne
     * rendue n'a que les colonnes de `fields[property_visits]`. Relu par {@see VisitReadContext} (une
     * requête pour la page, déjà payée par les autres règles de la ressource). Une visite absente de
     * la base (rien à relire) se juge sur ses propres colonnes, si elle les porte toutes ; sinon
     * rien n'est connu : `null`, et chaque règle se ferme.
     *
     * @return array{customer_id: ?int, visitor_id: ?int, agency_id: ?int, property_live: bool}|null
     */
    private function identiteRelue(Request $request): ?array
    {
        $ctx = VisitReadContext::for($request, $this->resource);
        if ($ctx !== null) {
            return $ctx;
        }

        $attributes = $this->resource->getAttributes();
        foreach (['customer_id', 'visitor_id', 'property_id'] as $colonne) {
            if (! array_key_exists($colonne, $attributes)) {
                return null;
            }
        }
        $property = $this->property;

        return [
            'customer_id' => $this->customer_id !== null ? (int) $this->customer_id : null,
            'visitor_id' => $this->visitor_id !== null ? (int) $this->visitor_id : null,
            'agency_id' => $property?->agency_id !== null ? (int) $property->agency_id : null,
            'property_live' => $property !== null,
        ];
    }
}
