<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\CustomerNoteKind;
use App\Policies\CustomerPolicy;
use App\Services\Crm\CustomerCommercialAttributes;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Support\Masking;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;

class CustomerResource extends BaseResource
{
    /**
     * TCK-808 — les colonnes réservées au lecteur de la fiche, jugées par `getAttributes()`. Le
     * numéro de pièce y reste sous sa clé de colonne `id_number` : il ne sort plus que masqué
     * (`id_number_masked`, TCK-953), mais sa présence décide toujours de relire la policy.
     */
    private const RESERVES = ['id_type', 'id_number', 'emergency_contact_name', 'emergency_contact_phone', 'notes', 'metadata'];

    public function toArray(Request $request): array
    {
        // TCK-808 (P23.02) — la pièce, le contact d'urgence, les notes et `metadata` ne sortent que
        // vers le lecteur qu'admet `CustomerPolicy::view`. La ressource est imbriquée dans le bail
        // (`tenant`) et la réservation (`customer`), et le bailleur, à qui la fiche est refusée
        // (TCK-587), les lisait par là. Étalé, comme les critères, pour la même raison.
        $litLaFiche = $this->readsCustomer($request);

        return [
            'id' => $this->id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'email' => $this->email,
            'phone' => $this->phone,
            ...($litLaFiche ? ['id_type' => $this->id_type?->value] : []),
            // TCK-953 (ADR-0070 § 3) — le masque seulement, et seulement si la colonne a été lue :
            // une liste sous `fields[customers]` ne déchiffre aucune ligne. La fiche la charge
            // toujours (`CustomerController::show`).
            ...($litLaFiche && array_key_exists('id_number', $this->resource->getAttributes()) ? [
                'id_number_masked' => is_string($numero = $this->resource->id_number) && $numero !== ''
                    ? Masking::tail($numero)
                    : null,
            ] : []),
            'occupation' => $this->occupation,
            ...($litLaFiche ? [
                'emergency_contact_name' => $this->emergency_contact_name,
                'emergency_contact_phone' => $this->emergency_contact_phone,
            ] : []),
            'status' => $this->status?->value,
            'pipeline_stage' => $this->pipeline_stage?->value,
            // TCK-921 — la langue des messages du client sans compte, saisie par l'agence.
            'locale' => $this->locale,
            'agency_id' => $this->agency_id,
            'user_id' => $this->user_id,
            'added_by_id' => $this->added_by_id,
            ...($litLaFiche ? ['metadata' => $this->metadata] : []),
            // TCK-705 (P20.01) — `notes` est une colonne ET une relation `HasMany`. `$this->notes`
            // retombait sur la relation quand la colonne n'était pas lue (`fields[customers]`) et
            // la chargeait paresseusement, une requête par ligne. La colonne si elle a été lue, la
            // relation si `include=notes` l'a chargée, rien sinon.
            'notes' => $this->when(
                $litLaFiche
                    && (array_key_exists('notes', $this->resource->getAttributes()) || $this->resource->relationLoaded('notes')),
                fn () => $this->notesLisibles($request),
            ),
            // TCK-591 §5 — les critères du prospect, que la fiche affiche et édite. Réservés au
            // personnel de l'agence de la fiche (verif-591 m2) : la ressource est imbriquée dans le
            // bail (`include=tenant`) et la réservation, et le bailleur lisait le budget plafond de
            // son locataire.
            // Étalé, pas `mergeWhen()` : les contrôleurs appellent `toArray()` directement, et un
            // `MergeValue` n'y est pas résolu.
            ...($this->readsCriteria($request) ? [
                'seeking_contract_type' => $this->seeking_contract_type,
                'budget_min' => $this->budget_min,
                'budget_max' => $this->budget_max,
                'seeking_property_types' => $this->seeking_property_types,
                'seeking_cities' => $this->seeking_cities,
                'seeking_neighborhoods' => $this->seeking_neighborhoods,
                'min_bedrooms' => $this->min_bedrooms,
            ] : []),
            // TCK-2582 (ADR-0101) — d'où vient la fiche : la demande (date, message cité, bien) et le
            // bien qui a fait venir la personne. Au seul lecteur des critères (personnel de l'agence
            // de la fiche) : le message n'est jamais recopié vers un compte hors du personnel — la
            // ressource est imbriquée dans le bail et la réservation, que le bailleur lit.
            ...($this->readsOrigin($request) ? $this->origine() : []),
            // TCK-2583 — le dernier contact : geste, note, visite terminée ou compte rendu.
            'last_contacted_at' => $this->iso($this->last_contacted_at),
            'created_at' => $this->iso($this->created_at),
            'updated_at' => $this->iso($this->updated_at),
            'tasks_count' => $this->whenCounted('tasks'),
            // TCK-2588 — `next_action`, `follow_up`, `referent` : calculés pour la page, rendus
            // seulement quand `fields[customers]` les demande.
            ...CustomerCommercialAttributes::of($request, (int) $this->id),
            // Vérification adverse de TCK-2588 — les visites d'une fiche (compte, à venir) sont au
            // seul personnel de son agence (et au super-admin) : le bailleur auteur de la fiche
            // lisait sinon les visites du client sur le bien d'un AUTRE bailleur, que
            // `PropertyVisitPolicy::view` lui refuse.
            'visits_count' => $this->when(
                array_key_exists('visits_count', $this->resource->getAttributes()) && $this->readsVisits($request),
                fn () => (int) $this->visits_count,
            ),
            'upcoming_visits' => $this->when(
                $this->relationLoaded('upcomingVisits') && $this->readsVisits($request),
                fn () => $this->upcomingVisits->map(fn ($v) => [
                    'id' => $v->id,
                    'property_id' => $v->property_id,
                    'status' => $v->status?->value,
                    'scheduled_at' => $this->iso($v->scheduled_at),
                ])->values(),
            ),
            'added_by' => $this->when(
                $this->relationLoaded('addedBy'),
                fn () => $this->addedBy ? [
                    'id' => $this->addedBy->id,
                    'first_name' => $this->addedBy->first_name,
                    'last_name' => $this->addedBy->last_name,
                    'full_name' => $this->addedBy->getFullNameAttribute(),
                ] : null,
            ),
            'tags' => $this->when(
                $this->relationLoaded('tags'),
                fn () => $this->tags->map(fn ($t) => [
                    'id' => $t->id,
                    'name' => $t->name,
                    'slug' => $t->slug,
                    'color' => $t->color,
                ])->values(),
            ),
            'documents' => $this->when(
                $this->relationLoaded('documents'),
                fn () => $this->documents->map(fn ($d) => [
                    'id' => $d->id,
                    'name' => $d->name,
                    'type' => $d->type?->value,
                    'created_at' => $this->iso($d->created_at),
                ])->values(),
            ),
        ];
    }

    /**
     * TCK-2578 (ADR-0101 § 2) — la relation `notes` chargée par `include=notes` porte aussi les
     * comptes rendus de visite (`visit_report`) : ils ne sortent qu'au personnel de l'agence
     * (`CustomerPolicy::viewVisitReports`). La colonne texte `notes`, quand elle est lue, passe telle
     * quelle.
     */
    private function notesLisibles(Request $request): mixed
    {
        $notes = $this->resource->notes;
        if (! $notes instanceof Collection) {
            return $notes;
        }

        // Jugée sur la fiche relue (`agency_id`, `added_by_id`) : sous `fields[customers]`, le modèle
        // rendu ne porte pas l'agence, et le personnel perdait ses comptes rendus.
        $user = $request->user();
        if ($user !== null && $user->can('viewVisitReports', $this->ficheJugeable($request))) {
            return $notes;
        }

        // TCK-2582 — le message d'origine d'une demande (`lead_message`) suit la même règle.
        return $notes->reject(fn (CustomerNote $note) => in_array($note->kind?->value, CustomerNoteKind::staffOnlyValues(), true))->values();
    }

    /**
     * {@see CustomerPolicy::view()}, jugée une fois par requête et par couple (agence de la fiche,
     * auteur ou non) : ce sont les seuls traits de la fiche que la règle lit. Une liste de baux ne
     * rejoue donc pas la policy à chaque ligne.
     */
    private function readsCustomer(Request $request): bool
    {
        // Rien de réservé n'a été lu (`fields[customers]` sans eux) : il n'y a rien à cacher, et la
        // liste du CRM ne relit pas chaque fiche pour le savoir.
        $lus = array_intersect(self::RESERVES, array_keys($this->resource->getAttributes()));
        if ($lus === [] && ! $this->resource->relationLoaded('notes')) {
            return true;
        }

        $user = $request->user();
        if ($user === null) {
            return false;
        }

        $fiche = $this->ficheJugeable($request);
        $key = 'tck808.reads_customer.'.$user->id.'.'.($fiche->agency_id ?? 'aucune')
            .'.'.($fiche->added_by_id === $user->id ? 'auteur' : 'tiers');
        if (! $request->attributes->has($key)) {
            $request->attributes->set($key, $user->can('view', $fiche));
        }

        return (bool) $request->attributes->get($key);
    }

    /**
     * La fiche telle que la policy la lit. Un `fields[customers]` qui omet `agency_id` ou
     * `added_by_id` laisse la fiche sans les deux traits que la règle juge : ils sont relus, une fois
     * par fiche et par requête. Les lectures du front les demandent toutes deux dès qu'elles
     * demandent un champ réservé (`DASHBOARD_CUSTOMER_DETAIL_FIELDS`, `PIPELINE_CARD_FIELDS`).
     */
    /**
     * Vérification adverse de TCK-2588 — pose, en une requête pour la page, la fiche « jugeable »
     * ({@see self::ficheJugeable()}) de chaque fiche dont `fields[customers]` n'a lu ni l'agence ni
     * l'auteur : sans elle, la règle des visites relisait la fiche une fois par ligne.
     *
     * @param  iterable<Customer>  $customers
     */
    public static function primeFiches(Request $request, iterable $customers): void
    {
        $ids = [];
        foreach ($customers as $customer) {
            $attributs = $customer->getAttributes();
            if (! (array_key_exists('agency_id', $attributs) && array_key_exists('added_by_id', $attributs))
                && ! $request->attributes->has('tck808.fiche.'.$customer->getKey())) {
                $ids[] = $customer->getKey();
            }
        }
        if ($ids === []) {
            return;
        }

        foreach (Customer::query()->select(['id', 'agency_id', 'added_by_id'])->whereKey($ids)->get() as $fiche) {
            $request->attributes->set('tck808.fiche.'.$fiche->getKey(), $fiche);
        }
    }

    private function ficheJugeable(Request $request): Customer
    {
        $attributs = $this->resource->getAttributes();
        if (array_key_exists('agency_id', $attributs) && array_key_exists('added_by_id', $attributs)) {
            return $this->resource;
        }

        $key = 'tck808.fiche.'.$this->resource->getKey();
        if (! $request->attributes->has($key)) {
            $request->attributes->set($key, Customer::query()->select(['id', 'agency_id', 'added_by_id'])
                ->whereKey($this->resource->getKey())->first() ?? $this->resource);
        }

        return $request->attributes->get($key);
    }

    /**
     * TCK-2582 — la règle des critères ({@see Customer::criteriaBelongTo()}), jugée sur la fiche
     * relue quand `fields[customers]` n'a pas lu son agence : sans elle, le personnel perdait
     * l'origine qu'il avait demandée. Rien n'est relu si aucune des deux relations n'est chargée.
     */
    private function readsOrigin(Request $request): bool
    {
        $user = $request->user();
        if ($user === null
            || (! $this->resource->relationLoaded('origin') && ! $this->resource->relationLoaded('interestedProperty'))) {
            return false;
        }

        $key = 'tck591.staff_agency_ids';
        if (! $request->attributes->has($key)) {
            $request->attributes->set($key, app(MembershipCapabilityResolver::class)->staffAgencyIds($user));
        }

        return $this->ficheJugeable($request)->criteriaBelongTo($user, $request->attributes->get($key));
    }

    /**
     * Vérification adverse de TCK-2588 — les visites de la fiche, au seul personnel de son agence (et
     * au super-admin) : la règle des critères, jugée sur la fiche relue quand `fields[customers]`
     * n'a pas lu son agence (comme {@see self::readsOrigin()}).
     */
    private function readsVisits(Request $request): bool
    {
        $user = $request->user();
        if ($user === null) {
            return false;
        }

        $key = 'tck591.staff_agency_ids';
        if (! $request->attributes->has($key)) {
            $request->attributes->set($key, app(MembershipCapabilityResolver::class)->staffAgencyIds($user));
        }

        return $this->ficheJugeable($request)->criteriaBelongTo($user, $request->attributes->get($key));
    }

    /**
     * TCK-2582 — `origin` et `interested_property`, rendus seulement si `include=origin` /
     * `include=interestedProperty` les a chargés.
     *
     * @return array<string, mixed>
     */
    private function origine(): array
    {
        $out = [];

        if ($this->resource->relationLoaded('origin')) {
            $lead = $this->resource->origin;
            $out['origin'] = $lead === null ? null : [
                'contact_lead_id' => $lead->id,
                'received_at' => $this->iso($lead->created_at),
                'message' => $lead->message,
                'property' => $lead->property ? [
                    'id' => $lead->property->id,
                    'title' => $lead->property->title,
                    'slug' => $lead->property->slug,
                ] : null,
            ];
        }

        if ($this->resource->relationLoaded('interestedProperty')) {
            $property = $this->resource->interestedProperty;
            $out['interested_property'] = $property === null ? null : [
                'id' => $property->id,
                'title' => $property->title,
                'slug' => $property->slug,
            ];
        }

        return $out;
    }

    /**
     * {@see Customer::criteriaBelongTo()}, la règle partagée avec l'écriture. Les agences du personnel
     * sont lues une fois par requête, pas une fois par ligne.
     */
    private function readsCriteria(Request $request): bool
    {
        $user = $request->user();
        if ($user === null) {
            return false;
        }

        $key = 'tck591.staff_agency_ids';
        if (! $request->attributes->has($key)) {
            $request->attributes->set($key, app(MembershipCapabilityResolver::class)->staffAgencyIds($user));
        }

        return $this->resource->criteriaBelongTo($user, $request->attributes->get($key));
    }
}
