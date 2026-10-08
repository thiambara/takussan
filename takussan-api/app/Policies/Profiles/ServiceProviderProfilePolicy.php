<?php

namespace App\Policies\Profiles;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\Capability;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Providers\AppServiceProvider;

/**
 * TCK-260 — gates the carnet prestataires surface
 * (`/app/maintenance/providers`).
 *
 * super_admin bypasses every method via le hook global `Gate::before`
 * enregistré dans {@see AppServiceProvider}.
 *
 * Les autres acteurs côté agence doivent :
 *  - appartenir à une agence `standard` OU `individual` — un host
 *    individual a aussi besoin de son carnet de prestataires.
 *  - détenir un `AgencyAdminProfile` actif sur l'agence, OU bénéficier
 *    d'une `RoleDelegation` active pour `agency_admin` (TCK-108).
 */
class ServiceProviderProfilePolicy
{
    public function viewAny(User $user, ?Agency $agency = null): bool
    {
        if ($agency !== null) {
            // TCK-592 — qui assigne une intervention choisit dans le carnet : `maintenance.assign`
            // ouvre la lecture du carnet de SON agence, sans ouvrir l'invitation.
            return $this->canInviteIn($user, $agency)
                || $user->canActAt(Capability::MaintenanceAssign, $agency);
        }

        $agencyId = $user->agency_id;
        if ($agencyId === null) {
            return false;
        }

        return $user->isAgencyAdminAt((int) $agencyId)
            || $user->isAgentAt((int) $agencyId)
            || $user->isProviderAt((int) $agencyId);
    }

    public function view(User $user, ServiceProviderProfile $profile): bool
    {
        // Le SP lui-même peut se voir.
        if ($profile->user_id !== null && $profile->user_id === $user->id) {
            return true;
        }

        $agencyId = $user->agency_id;
        if ($agencyId === null) {
            return false;
        }

        if (! ($user->isAgencyAdminAt((int) $agencyId) || $user->isAgentAt((int) $agencyId))) {
            return false;
        }

        // L'acteur doit être rattaché à une agence qui collabore avec ce
        // profile. L'index controller filtre déjà par agency_id ; ici on
        // protège la route show / les écritures futures.
        return $profile->agencyCollaborations()
            ->where('agency_id', $agencyId)
            ->exists();
    }

    /**
     * `invite` est intentionnellement agency-scopé (le controller passe
     * l'Agency via `$user->can('invite', [ServiceProviderProfile::class, $agency])`).
     *
     * TCK-278 — Profile-based check (plus de spatie `setPermissionsTeamId`
     * + `hasPermissionTo`).
     */
    public function invite(User $user, Agency $agency): bool
    {
        $kind = $agency->kind instanceof AgencyKind
            ? $agency->kind
            : AgencyKind::tryFrom((string) $agency->kind);

        if ($kind !== AgencyKind::Standard && $kind !== AgencyKind::Individual) {
            return false;
        }

        return $this->canInviteIn($user, $agency);
    }

    /**
     * TCK-592 — mettre en pause, reprendre ou finir la collaboration d'un prestataire avec
     * l'agence : ceux qui l'y invitent.
     */
    public function manageCollaboration(User $user, ServiceProviderProfile $profile, Agency $agency): bool
    {
        return $this->canInviteIn($user, $agency);
    }

    /**
     * TCK-592 — le prestataire met fin à SA collaboration. Il ne la met pas en pause et ne la
     * reprend pas : ce sont des gestes de l'agence.
     */
    public function endCollaboration(User $user, ServiceProviderAgencyCollaboration $collaboration): bool
    {
        $profile = $collaboration->serviceProviderProfile;

        return $profile !== null && $profile->user_id !== null && (int) $profile->user_id === (int) $user->id;
    }

    protected function canInviteIn(User $user, Agency $agency): bool
    {
        $kind = $agency->kind instanceof AgencyKind
            ? $agency->kind
            : AgencyKind::tryFrom((string) $agency->kind);

        if ($kind !== AgencyKind::Standard && $kind !== AgencyKind::Individual) {
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
