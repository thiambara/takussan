<?php

namespace App\Services\Membership;

use Illuminate\Database\Eloquent\Model;

/**
 * Le seul chemin qui matérialise un profil d'agence (`AgentProfile`, `AgencyAdminProfile`,
 * `OwnerProfile`) pour une paire `(user_id, agency_id)`.
 *
 * Ces profils se suppriment en douceur, et l'unicité `(user_id, agency_id)` de leurs tables est
 * pleine (aucun `WHERE deleted_at IS NULL`). Un `firstOrCreate` ne voit pas la ligne supprimée et
 * tente un INSERT sur une paire déjà prise : 500 (P92.02). Ici, une ligne supprimée est
 * restaurée, avec ce qu'elle portait (dont son `agency_role_id`, donc ses capacités d'avant) ;
 * les `$defaults` (le statut) y sont réécrits. Une ligne active est laissée telle quelle.
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
            if ($defaults !== []) {
                $existing->forceFill($defaults)->save();
            }
        }

        return $existing;
    }
}
