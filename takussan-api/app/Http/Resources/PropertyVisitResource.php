<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Policies\PropertyVisitPolicy;
use App\Rules\PersonnelDeLAgence;
use App\Services\Media\PublicPhotoUrl;
use App\Services\Visit\VisitReadContext;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;

class PropertyVisitResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $fiche = $this->ficheClientLisible($request);
        // Passe 4 (M7″) — planifier pour une fiche recopie son nom, son téléphone et son e-mail
        // dans `visitor_*` : sans la fiche, ils ne se lisent pas davantage par là. Une visite sans
        // fiche (demande publique) garde les siens. TCK-696 (P21.03) — même règle pour le bloc
        // `visitor` : une fiche liée à un compte pose `visitor_id` sur ce compte, et son nom, son
        // e-mail et son téléphone sortiraient sinon par `include=visitor`.
        $visiteurLisible = $fiche || $this->customer_id === null;

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
            'notes' => $this->notes,
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
            ] : null),
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
            'report' => $this->when($this->compteRenduLisible($request), fn (): ?array => $this->reported_at === null ? null : [
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
            // liste coûterait) : confirmer, clore, déclarer manquée, déplacer ou annuler au nom de
            // ceux qui gèrent le bien, c'est `update` ET `agitPourLeBien`, comme le contrôleur.
            'abilities' => $this->when($this->isDetailRequest($request), fn (): array => [
                'manage' => $request->user()->can('update', $this->resource)
                    && PropertyVisitPolicy::agitPourLeBien($request->user(), $this->resource),
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
     * de l'agence du bien, au propriétaire d'un bien sans agence ; `null` pour tout autre lecteur
     * (le visiteur, le client, le bailleur d'un bien d'agence) — comme `visits_on_property` d'une
     * réservation (TCK-2593). Jugé sur les valeurs RELUES : la ligne rendue peut ne porter ni la
     * fiche ni l'agence.
     *
     * @return array{name: ?string, phone: ?string, kind: string, visits_on_property: int}|null
     */
    private function visitorDisplay(Request $request): ?array
    {
        if (! $this->outilDeLaConsole($request)) {
            return null;
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
     * actif de l'agence du bien), jugée sans relire le bien ligne par ligne : l'index pose
     * `visits.property_agencies` et `visits.staff_agencies` ; ailleurs, le verdict est retenu par
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

        $agences = $request->attributes->get('visits.property_agencies');
        if (is_array($agences) && array_key_exists((int) $this->property_id, $agences)) {
            $agencyId = $agences[(int) $this->property_id];
        } elseif ($this->property !== null) {
            $agencyId = $this->property->agency_id;
        } else {
            return false;
        }

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
     * L'index pose l'agence de chaque bien de la page (`visits.property_agencies`) et les agences
     * où le lecteur est personnel (`visits.staff_agencies`) : rien n'est relu ligne par ligne.
     * Ailleurs, le verdict est retenu par agence pour la requête.
     *
     * Passes 4 et 5 (X1, X1′) — le personnel est jugé par `PersonnelDeLAgence::personnelActifDe`
     * (compte joignable, agence du profil actif), la définition de `PropertyVisitPolicy::view`.
     */
    private function ficheClientLisible(Request $request): bool
    {
        if ($this->customer_id === null) {
            return true;
        }

        $user = $request->user();
        if ($user === null) {
            return false;
        }

        if ($user->isSuperAdmin() || $this->visitor_id === $user->id) {
            return true;
        }

        $agences = $request->attributes->get('visits.property_agencies');
        if (is_array($agences) && array_key_exists((int) $this->property_id, $agences)) {
            $agencyId = $agences[(int) $this->property_id];
        } elseif ($this->property !== null) {
            $agencyId = $this->property->agency_id;
        } else {
            return false;
        }

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
}
