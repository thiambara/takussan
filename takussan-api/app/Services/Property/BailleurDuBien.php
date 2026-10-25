<?php

namespace App\Services\Property;

use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Contracts\Database\Eloquent\Builder;

/**
 * TCK-1718 (P160.01 à P160.03, porteur 2026-10-22) — l'utilisateur que désigne une colonne de
 * « bailleur » (`properties.user_id`, `leases.landlord_id`) en est-il le bailleur ?
 *
 * `properties.user_id` est le CRÉATEUR du bien : son propriétaire pour un particulier, mais, sur un
 * bien d'agence, aussi bien l'agent qui l'a saisi (`PropertyController::store` y pose l'appelant).
 * Lu tel quel, il faisait passer l'agent créateur par la branche « bailleur » des gestes —
 * rembourser, confirmer, ouvrir un bail, commander une intervention —, avant tout contrôle des
 * capacités que son rôle lui retire. `LeaseService::create` recopie ce créateur en
 * `leases.landlord_id` (P15.06, TCK-997) : la même règle vaut pour le bail.
 *
 * Bailleur : désigné par la colonne, ET le bien est sans agence, ou il détient un profil
 * propriétaire dans l'agence. Sans condition de statut, délibérément (voie la plus étroite) : le
 * bailleur suspendu reste jugé par `BasePolicy::landlordWrites`, comme avant. Le personnel créateur
 * est jugé par la branche du personnel et ses capacités.
 */
final class BailleurDuBien
{
    public static function est(?User $user, mixed $designeId, mixed $agencyId): bool
    {
        if ($user === null || $designeId === null || (int) $designeId !== (int) $user->id) {
            return false;
        }

        return $agencyId === null || OwnerProfile::query()
            ->where('user_id', $user->id)
            ->where('agency_id', (int) $agencyId)
            ->exists();
    }

    /**
     * TCK-1928 (P190.01) — la même règle pour une liste : les lignes dont `$colonne` désigne
     * l'utilisateur, ET dont `$colonneAgence` est nulle ou une agence où il détient un profil
     * propriétaire. Lue par les listes des baux, des états des lieux et des réservations, pour
     * qu'une ligne refusée par `view` ne reste pas dans la liste. `$user` peut n'être qu'un
     * identifiant : `PortfolioScope` ne porte que celui du bailleur (TCK-2275).
     */
    public static function restreindre(Builder $query, User|int $user, string $colonne = 'user_id', string $colonneAgence = 'agency_id'): Builder
    {
        $userId = $user instanceof User ? (int) $user->id : $user;

        return $query->where($colonne, $userId)
            ->where(fn (Builder $q) => $q->whereNull($colonneAgence)
                ->orWhereIn($colonneAgence, self::agences($userId)));
    }

    /**
     * TCK-2275 (P232.01 ; ADR-0031, amendement du 2026-10-25) — les agences où l'utilisateur détient
     * un profil propriétaire, de tout statut : la sous-requête de {@see self::restreindre()}, que lit
     * aussi le SQL brut de `PortfolioMetrics`.
     */
    public static function agences(int $userId): Builder
    {
        return OwnerProfile::query()->where('user_id', $userId)->select('agency_id');
    }
}
