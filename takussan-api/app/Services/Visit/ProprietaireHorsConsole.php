<?php

namespace App\Services\Visit;

use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;

/**
 * TCK-2717 (décision du porteur du 2026-11-11, option a) — le propriétaire d'un bien confié à une
 * agence, quand il n'est pas de la console de ce bien : il est le propriétaire (`properties.user_id`)
 * d'un bien d'agence dont il n'est pas personnel (`isStaffAt`, quel que soit l'espace ouvert), et
 * n'est pas super-admin.
 *
 * UNE fonction, jugée sur l'agence et le propriétaire du BIEN (valeurs relues) et jamais sur le profil
 * actif — pour le lecteur d'une visite (`PropertyVisitResource::visitorDisplay`, la carte réduite) comme
 * pour le destinataire d'un avis (`VisitNotifier::params`, le `contact` de « visite demandée »). Ce
 * lecteur lit le contact d'un visiteur SANS fiche, partout ; celui d'une visite à fiche, nulle part.
 */
final class ProprietaireHorsConsole
{
    public static function est(User $user, ?int $ownerId, ?int $agencyId): bool
    {
        return $ownerId !== null
            && $ownerId === (int) $user->getKey()
            && $agencyId !== null
            && ! $user->isSuperAdmin()
            && ! app(MembershipCapabilityResolver::class)->isStaffAt($user, $agencyId);
    }
}
