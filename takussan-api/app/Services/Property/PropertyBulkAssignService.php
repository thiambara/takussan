<?php

namespace App\Services\Property;

use App\Exceptions\ApiError;
use App\Models\Property;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * TCK-603 (ADR-0059 §2) — changer l'agent responsable d'un lot de biens, sur le modèle de
 * {@see PropertyBulkVisibilityService}.
 *
 *  - chaque ligne passe par la MÊME autorisation que l'endpoint unitaire `PUT …/assigned-agent`
 *    (`update` de `PropertyPolicy`), puis par le MÊME service, {@see ResponsibleAgentAssigner} :
 *    même règle de cible (TCK-587), même désignation (TCK-504), jamais d'écriture de `user_id` ;
 *  - une transaction pour le lot, un point de sauvegarde par bien : un refus de règle n'annule que
 *    son bien, toute autre exception annule le lot ;
 *  - les biens sont traités par identifiant croissant : deux lots qui se recouvrent verrouillent dans
 *    le même ordre ;
 *  - les motifs sont des CODES : `not_found | forbidden | invalid_target` ; une cible déjà responsable
 *    est `unchanged`, pas un refus.
 */
class PropertyBulkAssignService
{
    public function __construct(private readonly ResponsibleAgentAssigner $assigner) {}

    /**
     * @param  int[]  $propertyIds
     * @return array{updated: int, updated_ids: int[], unchanged: int, unchanged_ids: int[], failed: list<array{id: int, reason: string}>}
     */
    public function assign(array $propertyIds, User $target, User $actor): array
    {
        $propertyIds = array_values(array_unique(array_map('intval', $propertyIds)));
        $properties = Property::query()->whereIn('id', $propertyIds)->get()->keyBy('id');

        $failed = [];
        $authorized = [];
        foreach ($propertyIds as $id) {
            $property = $properties->get($id);
            $reason = match (true) {
                $property === null => 'not_found',
                ! $actor->can('update', $property) => 'forbidden',
                default => null,
            };
            $reason === null ? $authorized[$id] = $property : $failed[] = ['id' => $id, 'reason' => $reason];
        }
        ksort($authorized);

        $updatedIds = [];
        $unchangedIds = [];
        if ($authorized !== []) {
            DB::transaction(function () use ($authorized, $target, $actor, &$updatedIds, &$unchangedIds, &$failed): void {
                foreach ($authorized as $id => $property) {
                    try {
                        $result = $this->assigner->assign($property, $target, $actor);
                    } catch (ApiError $e) {
                        if (! in_array($e->errorCode, ResponsibleAgentAssigner::TARGET_REFUSALS, true)) {
                            throw $e;
                        }
                        $failed[] = ['id' => $id, 'reason' => 'invalid_target'];

                        continue;
                    }
                    $result->changed ? $updatedIds[] = $id : $unchangedIds[] = $id;
                }
            });
        }

        return [
            'updated' => count($updatedIds),
            'updated_ids' => $updatedIds,
            'unchanged' => count($unchangedIds),
            'unchanged_ids' => $unchangedIds,
            'failed' => $failed,
        ];
    }
}
