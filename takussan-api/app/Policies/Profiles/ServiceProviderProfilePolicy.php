<?php

namespace App\Policies\Profiles;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Services\Invitation\ServiceProviderInvitationService;
use Spatie\Permission\PermissionRegistrar;

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
 *  - détenir la permission `invite_service_provider` *sous le team
 *    context de l'agence* (default-granted à `agency_admin`,
 *    déléguable à un agent via {@see RoleDelegation}).
 */
class ServiceProviderProfilePolicy
{
    public function viewAny(User $user, ?Agency $agency = null): bool
    {
        if ($agency !== null) {
            return $this->canInviteIn($user, $agency);
        }

        return $user->hasAnyRole(['admin', 'agency_admin', 'agent', 'service_provider']);
    }

    public function view(User $user, ServiceProviderProfile $profile): bool
    {
        // Le SP lui-même peut se voir.
        if ($profile->user_id !== null && $profile->user_id === $user->id) {
            return true;
        }

        if (! $user->hasAnyRole(['admin', 'agency_admin', 'agent'])) {
            return false;
        }

        // Sinon, l'acteur doit être rattaché à une agence qui collabore
        // avec ce profile. L'index controller filtre déjà par agency_id ;
        // ici on protège la route show / les écritures futures.
        $agencyId = $user->agency_id;
        if ($agencyId === null) {
            return false;
        }

        return $profile->agencyCollaborations()
            ->where('agency_id', $agencyId)
            ->exists();
    }

    /**
     * `invite` est intentionnellement agency-scopé (le controller passe
     * l'Agency via `$user->can('invite', [ServiceProviderProfile::class, $agency])`).
     */
    public function invite(User $user, Agency $agency): bool
    {
        return $this->canInviteIn($user, $agency);
    }

    protected function canInviteIn(User $user, Agency $agency): bool
    {
        $kind = $agency->kind instanceof AgencyKind
            ? $agency->kind
            : AgencyKind::tryFrom((string) $agency->kind);

        if ($kind !== AgencyKind::Standard && $kind !== AgencyKind::Individual) {
            return false;
        }

        $registrar = app(PermissionRegistrar::class);
        $previous = $registrar->getPermissionsTeamId();
        $registrar->setPermissionsTeamId($agency->id);

        try {
            $user->unsetRelation('roles');
            $user->unsetRelation('permissions');
            $allowed = $user->hasPermissionTo(ServiceProviderInvitationService::PERMISSION, 'web');
        } catch (\Throwable) {
            $allowed = false;
        } finally {
            $registrar->setPermissionsTeamId($previous);
            $user->unsetRelation('roles');
            $user->unsetRelation('permissions');
        }

        return $allowed;
    }
}
