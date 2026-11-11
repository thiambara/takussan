<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Support\AgencyKindGuard;

/**
 * TCK-256 — gates the owner invitation surface.
 *
 * super_admin bypasses every method via the global `Gate::before` hook
 * registered in {@see AppServiceProvider}.
 *
 * Other agency-side actors must:
 *  - belong to a `standard` agency (TCK-248); `individual` agencies
 *    don't have a portfolio of distinct owners.
 *  - hold an `AgencyAdminProfile` actif sur l'agence, OU bénéficier d'une
 *    `RoleDelegation` active pour le rôle `agency_admin` (TCK-108).
 */
class OwnerProfilePolicy
{
    public function viewAny(User $user): bool
    {
        $agencyId = $user->agency_id;
        if ($agencyId === null) {
            return false;
        }

        return $user->isAgencyAdminAt((int) $agencyId) || $user->isAgentAt((int) $agencyId);
    }

    public function view(User $user, OwnerProfile $profile): bool
    {
        $agencyId = $user->agency_id;
        if ($agencyId !== null
            && ($user->isAgencyAdminAt((int) $agencyId) || $user->isAgentAt((int) $agencyId))) {
            return $profile->agency_id === $agencyId;
        }

        return $profile->user_id === $user->id;
    }

    /**
     * TCK-601 (ADR-0044 §1) — lire le RIB, le NINEA et le numéro de pièce EN CLAIR : l'admin actif
     * de l'agence du profil, jugé sur l'agence de son profil ACTIF (principe n° 2). Un agent lit le
     * carnet, jamais ces valeurs. Le super-admin passe par `Gate::before`. Pas de capacité dédiée
     * tant que les capacités de lecture ne sont pas branchées (option retenue du ticket).
     */
    public function viewSensitive(User $user, OwnerProfile $profile): bool
    {
        $agencyId = $user->agency_id;

        return $agencyId !== null
            && (int) $agencyId === (int) $profile->agency_id
            && $user->isAgencyAdminAt((int) $agencyId);
    }

    /**
     * TCK-2640 — la fiche d'un bailleur et les gestes qui la touchent se jugent dans l'agence du
     * PERSONNEL de l'appelant (agent ou admin actif, ADR-0031) : un profil hors de cette agence
     * n'existe pas pour lui (404, jamais 403 — le refus dirait qu'il existe). Un bailleur de la même
     * agence est hors du personnel : il ne sonde pas le carnet des autres bailleurs. Le super-admin
     * voit tout (`Gate::before` ne passe pas ici : c'est une résolution, pas une autorisation).
     */
    public static function isInActorAgency(User $user, OwnerProfile $profile): bool
    {
        return $user->isSuperAdmin() || $user->staffAgencyId() === (int) $profile->agency_id;
    }

    /**
     * TCK-2640 — la fiche (`GET /api/owners/{id}`) : l'admin actif de l'agence du profil, comme
     * {@see self::viewSensitive()}. Elle dit ce qui reste à verser au bailleur et son plafond de
     * travaux ; l'agent lit le carnet (`viewAny`), pas la fiche — l'accès de l'agent est hors du
     * ticket, à trancher (la maquette le cite en persona).
     */
    public function viewDetail(User $user, OwnerProfile $profile): bool
    {
        return $user->staffAgencyId() === (int) $profile->agency_id
            && $user->isAgencyAdminAt((int) $profile->agency_id);
    }

    /**
     * TCK-2640 — régler ce que l'agence tient sur le bailleur (le plafond de travaux) : la capacité
     * `owners.update` dans l'agence du profil, celle du profil actif.
     */
    public function update(User $user, OwnerProfile $profile): bool
    {
        if ($user->staffAgencyId() !== (int) $profile->agency_id) {
            return false;
        }
        $agency = Agency::query()->find((int) $profile->agency_id);

        return $agency !== null && $user->canActAt(Capability::OwnersUpdate, $agency);
    }

    /**
     * `invite` is intentionally agency-scoped (the controller passes the
     * Agency in via `$user->can('invite', [OwnerProfile::class, $agency])`).
     *
     * TCK-278 — Profile-based check (no more spatie `setPermissionsTeamId` +
     * `hasPermissionTo`).
     */
    public function invite(User $user, Agency $agency): bool
    {
        // TCK-449 (AC5) — même définition que l'invitation et le rattachement,
        // lue au même endroit. La policy rend un booléen là où les services
        // lèvent un 403 : c'est la FORME qui diffère, pas la règle.
        if (! AgencyKindGuard::canFormTeam($agency)) {
            return false;
        }

        if ($user->isAgencyAdminAt((int) $agency->id)) {
            return true;
        }

        // TCK-395 — la moitié « délégation » de ce test passait par
        // `hasActiveAgencyDelegation($id, 'agency_admin')` : un simple test de
        // CHAÎNE, qui accordait l'agency_admin PLEIN quel que soit ce que le
        // délégant détenait lui-même. `canActAt()` consulte désormais les
        // délégations (branche `delegationAllows`) et les BORNE par les
        // capacités propres du délégant. Le geste reste le même ; ce qui
        // change est qu'il passe enfin par le pivot `agency_role_capabilities`,
        // comme tout le reste depuis TCK-315.
        return $user->canActAt(Capability::TeamInvite, $agency);
    }
}
