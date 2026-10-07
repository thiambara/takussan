<?php

namespace App\Services\Lease;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Lease;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;

/**
 * TCK-596 — LE prédicat « qui signe pour le bailleur », partagé par la signature d'état des lieux
 * (§5) et la signature du bail (§4B). Une seule règle, deux voies :
 *
 *   1. le **bailleur du bail** (`leases.landlord_id`) signe pour lui-même — sauf s'il est suspendu
 *      dans l'agence du bail : il reste partie et lecteur, il perd les écritures (ADR-0031 §2) ;
 *   2. un membre du **personnel de l'agence du bail** (prédicat TCK-587 `isStaffAt`, jamais
 *      `users.agency_id`) titulaire de `leases.sign` dans CETTE agence signe **pour son compte**,
 *      au titre du mandat de gestion. La preuve enregistre alors `on_behalf_of`.
 *
 * Personne d'autre. Ni un collaborateur du bien, quel que soit son rôle (`viewer`, `co_owner`,
 * `agent`, `manager`) : un collaborateur qui est aussi du personnel passe par la voie 2. Ni le
 * super-admin, qui n'a pas de voie propre : `Gate::before` lui accorde tout, c'est pourquoi la
 * capacité est jugée ici par le résolveur, pour l'agence du bail, et non par `$user->can()`. Ni un
 * autre bailleur de l'agence.
 */
final class LandlordSignatory
{
    public static function allows(User $user, Lease $lease): bool
    {
        if (self::isLandlord($user, $lease)) {
            return $lease->agency_id === null || ! $user->isBlockedOwnerAt((int) $lease->agency_id);
        }

        return self::isMandatedStaff($user, $lease);
    }

    /**
     * Le bailleur pour le compte duquel `$user` signe : `null` quand c'est le bailleur lui-même.
     * À n'appeler qu'après {@see self::allows()}.
     */
    public static function onBehalfOf(User $user, Lease $lease): ?int
    {
        return self::isLandlord($user, $lease) ? null : (int) $lease->landlord_id;
    }

    private static function isLandlord(User $user, Lease $lease): bool
    {
        return $lease->landlord_id !== null && (int) $lease->landlord_id === (int) $user->id;
    }

    private static function isMandatedStaff(User $user, Lease $lease): bool
    {
        if ($lease->agency_id === null) {
            return false;
        }

        $agency = Agency::query()->find($lease->agency_id);
        if ($agency === null) {
            return false;
        }

        // TCK-587 — « personnel de l'agence » : agent ou admin d'agence actif, ou délégation active.
        return app(MembershipCapabilityResolver::class)->isStaffAt($user, (int) $agency->id)
            && $user->canActAt(Capability::LeasesSign, $agency);
    }
}
