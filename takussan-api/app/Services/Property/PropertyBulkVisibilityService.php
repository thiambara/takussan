<?php

namespace App\Services\Property;

use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * TCK-591 §7 — dépublier un lot de biens, sur le modèle de {@see PropertyBulkArchiveService}.
 *
 *  - chaque ligne passe par la MÊME autorisation que l'endpoint unitaire `PUT …/visibility`
 *    (`publish` de `PropertyPolicy`, TCK-587) ; un refus ne touche pas la base ;
 *  - la transaction ne couvre que le sous-ensemble autorisé : une exception au milieu annule tout ;
 *  - les motifs sont des CODES : `not_found | forbidden | unchanged`.
 */
class PropertyBulkVisibilityService
{
    /**
     * @param  int[]  $propertyIds
     * @return array{updated: int, updated_ids: int[], failed: list<array{id: int, reason: string}>}
     */
    public function apply(array $propertyIds, PropertyVisibility $visibility, User $actor): array
    {
        $propertyIds = array_values(array_unique(array_map('intval', $propertyIds)));
        $properties = Property::query()->whereIn('id', $propertyIds)->get()->keyBy('id');

        $failed = [];
        $authorized = [];
        foreach ($propertyIds as $id) {
            $property = $properties->get($id);
            $reason = match (true) {
                $property === null => 'not_found',
                ! $actor->can('publish', $property) => 'forbidden',
                $property->visibility === $visibility => 'unchanged',
                default => null,
            };
            $reason === null ? $authorized[] = $property : $failed[] = ['id' => $id, 'reason' => $reason];
        }

        $updatedIds = [];
        if ($authorized !== []) {
            DB::transaction(function () use ($authorized, $visibility, $actor, &$updatedIds): void {
                foreach ($authorized as $property) {
                    $previous = $property->visibility?->value;
                    $property->forceFill(['visibility' => $visibility])->save();

                    activity('Property')
                        ->performedOn($property)
                        ->causedBy($actor)
                        ->withProperties(['previous_visibility' => $previous, 'visibility' => $visibility->value])
                        ->event('property.visibility_bulk')
                        ->log('property.visibility_bulk');

                    $updatedIds[] = $property->id;
                }
            });
        }

        return ['updated' => count($updatedIds), 'updated_ids' => $updatedIds, 'failed' => $failed];
    }
}
