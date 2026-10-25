<?php

namespace App\Services\Membership;

use App\Models\Agency;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Profiles\AgentProfile;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-1770 (P136.04) — les affectations de rôle de membres DONNÉS, dans UNE agence : quel profil
 * de chacun vit dans l'agence, et quel rôle il porte.
 *
 * Une seule lecture pour deux appelants : `GET /api/agencies/{agency}/role-assignments` (TCK-279)
 * et la liste des membres, qui les rend pour ses lignes (`GET /api/users?with_role_assignments=1`).
 * L'autorisation reste aux appelants, par la même règle (`AgencyRolePolicy::viewAny`).
 *
 * L'entrée est bornée par l'appelant (les lignes qu'il affiche) : sans borne, la réponse serait la
 * liste de tous les profils de l'agence (cf. `RoleController::assignments`).
 */
class AffectationsDeRole
{
    /**
     * @param  list<int>  $userIds
     * @return list<array{profile_id: int, profile_type: string, user_id: int, agency_role_id: int, agency_role_name: ?string, commission_rate?: ?float}>
     */
    public function pour(Agency $agency, array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }

        $rows = [];
        foreach (AgencyRoleBaseType::assignableTypes() as $type) {
            /** @var class-string<Model>|null $class */
            $class = $type->profileClass();
            if ($class === null) {
                continue;
            }

            foreach (
                $class::query()
                    ->where('agency_id', $agency->id)
                    ->whereIn('user_id', $userIds)
                    ->with('agencyRole')
                    ->get() as $profile
            ) {
                $row = [
                    'profile_id' => (int) $profile->getKey(),
                    'profile_type' => $type->value,
                    'user_id' => (int) $profile->user_id,
                    'agency_role_id' => (int) $profile->agency_role_id,
                    'agency_role_name' => $profile->agencyRole?->name,
                ];
                // TCK-2364 (P241.02) — la fiche de membre lit le taux de l'agent là où elle lit son
                // rôle, sous la même règle (`team.assign_role`), qui est aussi celle de son écriture.
                if ($profile instanceof AgentProfile) {
                    $row['commission_rate'] = $profile->commission_rate !== null ? (float) $profile->commission_rate : null;
                }
                $rows[] = $row;
            }
        }

        return $rows;
    }
}
