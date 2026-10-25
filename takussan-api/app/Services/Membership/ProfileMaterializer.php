<?php

namespace App\Services\Membership;

use App\Models\Concerns\HasAgencyRole;
use Illuminate\Database\Eloquent\Model;

/**
 * Le seul chemin qui matérialise un profil d'agence (`AgentProfile`, `AgencyAdminProfile`,
 * `OwnerProfile`) pour une paire `(user_id, agency_id)`.
 *
 * Ces profils se suppriment en douceur, et l'unicité `(user_id, agency_id)` de leurs tables est
 * pleine (aucun `WHERE deleted_at IS NULL`). Un `firstOrCreate` ne voit pas la ligne supprimée et
 * tente un INSERT sur une paire déjà prise : 500 (P92.02). Ici, une ligne supprimée est
 * restaurée, avec ce qu'elle portait, SAUF son rôle : elle reçoit le rôle système de son type dans
 * son agence ; les `$defaults` (le statut) y sont réécrits. Une ligne active est laissée telle quelle.
 *
 * P242.02 (TCK-2365, décision du porteur du 2026-10-25 ; ADR-0031) — un membre retiré puis
 * rattaché reçoit le rôle système demandé, jamais son ancien rôle personnalisé. TCK-1450 restaurait
 * l'`agency_role_id` d'avant : un rôle personnalisé (`team.assign_role`, `payouts.approve`…)
 * revenait par un geste qui ne juge pas `team.assign_role`.
 *
 * TCK-278 l'avait écrit dans `UserRoleController` ; TCK-1450 l'en sort pour les autres écrivains.
 */
final class ProfileMaterializer
{
    /**
     * @param  class-string<Model>  $profileClass  un modèle de profil qui porte `SoftDeletes`
     * @param  array<string, mixed>  $match
     * @param  array<string, mixed>  $defaults
     */
    public static function materializeOrRestore(string $profileClass, array $match, array $defaults = []): Model
    {
        $existing = $profileClass::query()->withTrashed()->where($match)->first();

        if ($existing === null) {
            return $profileClass::query()->create(array_merge($match, $defaults));
        }

        if ($existing->trashed()) {
            $existing->restore();
            $patch = $defaults;
            if (in_array(HasAgencyRole::class, class_uses_recursive($existing), true) && $existing->agency_id !== null) {
                $patch['agency_role_id'] = app(AgencySystemRoleSeeder::class)
                    ->systemRoleFor((int) $existing->agency_id, $existing::agencyRoleBaseType())
                    ->id;
            }
            if ($patch !== []) {
                $existing->forceFill($patch)->save();
            }
        }

        return $existing;
    }
}
