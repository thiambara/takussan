<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Policies\CustomerPolicy;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Http\Request;

class CustomerResource extends BaseResource
{
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
        $user = $request->user();
        if ($user === null) {
            return false;
        }

        $key = 'tck808.reads_customer.'.$user->id.'.'.($this->resource->agency_id ?? 'aucune')
            .'.'.($this->resource->added_by_id === $user->id ? 'auteur' : 'tiers');
        if (! $request->attributes->has($key)) {
            $request->attributes->set($key, $user->can('view', $this->resource));
        }

        return (bool) $request->attributes->get($key);
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
