<?php

namespace App\Services\Property;

use App\Models\Profiles\OwnerProfile;
use App\Models\User;

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
}
