<?php

namespace App\Services\Lease;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Lease;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Property\BailleurDuBien;

/**
 * TCK-596 — LE prédicat « qui signe pour le bailleur », partagé par la signature d'état des lieux
 * (§5) et la signature du bail (§4B). Une seule règle, deux voies :
 *
 *   1. le **bailleur du bail** (`leases.landlord_id`, au sens de {@see BailleurDuBien::est()} depuis
 *      TCK-2803 : sur un bail d'agence, avec un profil propriétaire dans l'agence) signe pour
 *      lui-même — sauf s'il est suspendu ou parti (TCK-2753) dans l'agence du bail : il reste partie
 *      et lecteur, il perd les écritures
 *      (ADR-0031 §2, ADR-0108 § 5) ;
 *   2. un membre du **personnel de l'agence du bail** (prédicat TCK-587 `isStaffAt`, jamais
 *      l'accesseur d'agence unique de l'utilisateur) titulaire de `leases.sign` dans CETTE agence signe **pour son compte**,
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
        return $lease->landlord_id !== null && (int) $lease->landlord_id === (int) $user->id ? null : (int) $lease->landlord_id;
    }

    /**
     * TCK-2803 (P1) — le bailleur DU BAIL au sens de `LeasePolicy::view` ({@see BailleurDuBien::est()}) :
     * désigné par `landlord_id`, ET bail sans agence ou profil propriétaire dans son agence.
     * `landlord_id` recopie le créateur du bien, sur un bien d'agence l'agent qui l'a saisi (TCK-1926) :
     * lu tel quel, l'agent créateur PARTI de l'agence, à qui la fiche rend 403, signait pour le
     * bailleur et recevait le bail en réponse. L'agent créateur en poste signe par la voie 2.
     */
    private static function isLandlord(User $user, Lease $lease): bool
    {
        return BailleurDuBien::est($user, $lease->landlord_id, $lease->agency_id);
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
