<?php

namespace App\Services\Property;

use App\Exceptions\ApiError;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
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
    public function assign(array $propertyIds, User|int $target, User $actor): array
    {
        $target = $target instanceof User ? $target : $this->cible($target, $actor);
        $propertyIds = array_values(array_unique(array_map('intval', $propertyIds)));
        $properties = Property::query()->whereIn('id', $propertyIds)->get()->keyBy('id');

        $failed = [];
        $authorized = [];
        foreach ($propertyIds as $id) {
            $property = $properties->get($id);
            $reason = match (true) {
                $property === null => 'not_found',
                // TCK-817 — un bien que l'acteur ne lit pas ne se distingue pas d'un absent.
                ! $actor->can('update', $property) => $actor->can('view', $property) ? 'forbidden' : 'not_found',
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

    /**
     * TCK-817 (P22.02) — la cible se cherche parmi les MEMBRES de l'agence active (un profil de
     * bailleur, d'agent ou d'admin d'agence, de tout statut) : un compte absent et un compte d'une
     * autre agence rendent la même réponse. `exists:users,id` puis `User::findOrFail()` disaient
     * lesquels existent. La règle de ligne ({@see ResponsibleAgentAssigner::cibleAdmise()}, le
     * personnel ACTIF) juge ensuite, bien par bien. Le super-admin, qui lit déjà tous les comptes,
     * désigne tout compte existant, comme avant.
     */
    private function cible(int $userId, User $actor): User
    {
        $target = User::query()->find($userId);
        $agencyId = $actor->agency_id === null ? null : (int) $actor->agency_id;

        $membre = fn (User $user): bool => $agencyId !== null && (
            $user->hasProfileAt($agencyId, OwnerProfile::class)
            || $user->hasProfileAt($agencyId, AgentProfile::class)
            || $user->hasProfileAt($agencyId, AgencyAdminProfile::class)
        );
        $admise = $target !== null && ($actor->isSuperAdmin() || $membre($target));

        abort_code_unless($admise, 422, 'user.not_in_active_agency');

        return $target;
    }
}
