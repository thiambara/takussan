<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Customer;
use App\Policies\CustomerPolicy;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Http\Request;

class CustomerResource extends BaseResource
{
    /** TCK-808 — les colonnes réservées au lecteur de la fiche. */
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
            ...($litLaFiche ? [
                'id_type' => $this->id_type?->value,
                'id_number' => $this->id_number,
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
                fn () => $this->resource->notes,
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
            'created_at' => $this->iso($this->created_at),
            'updated_at' => $this->iso($this->updated_at),
            'tasks_count' => $this->whenCounted('tasks'),
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
