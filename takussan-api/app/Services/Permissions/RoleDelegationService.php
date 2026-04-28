<?php

namespace App\Services\Permissions;

use App\Events\Permissions\RoleDelegationActivated;
use App\Events\Permissions\RoleDelegationCreated;
use App\Events\Permissions\RoleDelegationExpired;
use App\Events\Permissions\RoleDelegationRevoked;
use App\Models\Agency;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RoleDelegationService
{
    public function __construct(
        private readonly PermissionRegistrar $registrar,
    ) {}

    public function create(Agency $agency, User $delegator, array $data): RoleDelegation
    {
        $userId = $data['user_id'];
        $role = $data['role'];

        /** @var User $user */
        $user = User::findOrFail($userId);

        // Business validations not covered by FormRequest
        if ($user->id === $delegator->id) {
            throw ValidationException::withMessages([
                'user_id' => __('role_delegations.validation.self_delegation'),
            ]);
        }

        if ($user->agency_id !== $agency->id) {
            throw ValidationException::withMessages([
                'user_id' => __('role_delegations.validation.user_not_in_agency'),
            ]);
        }

        // If role is agency_admin and user is already primary_admin of any agency -> reject
        if ($role === 'agency_admin') {
            $isPrimaryAdminOfAnyAgency = Agency::where('primary_admin_id', $user->id)->exists();
            if ($isPrimaryAdminOfAnyAgency) {
                throw ValidationException::withMessages([
                    'role' => __('role_delegations.validation.already_primary_admin'),
                ]);
            }
        }

        return DB::transaction(function () use ($agency, $delegator, $user, $data) {
            // Snapshot current native roles
            $this->registrar->setPermissionsTeamId($agency->id);
            $nativeRoles = $user->getRoleNames()->all();

            $startsAt = $data['starts_at'] ?? null;
            $isImmediate = is_null($startsAt) || now()->gte($startsAt);

            $status = $isImmediate ? RoleDelegationStatus::Active : RoleDelegationStatus::Scheduled;

            /** @var RoleDelegation $delegation */
            $delegation = RoleDelegation::create([
                'user_id' => $user->id,
                'delegator_id' => $delegator->id,
                'agency_id' => $agency->id,
                'role' => $data['role'],
                'starts_at' => $startsAt,
                'ends_at' => $data['ends_at'],
                'status' => $status,
                'reason' => $data['reason'] ?? null,
                'user_native_roles_snapshot' => $nativeRoles,
                'activated_at' => $isImmediate ? now() : null,
            ]);

            // If immediate, sync roles now
            if ($isImmediate) {
                $this->sync($user, $agency);
                event(new RoleDelegationActivated($delegation));
            }

            event(new RoleDelegationCreated($delegation));

            // Activity log
            activity()
                ->causedBy($delegator)
                ->performedOn($delegation)
                ->withProperties(['role' => $data['role']])
                ->log('role_delegation.created');

            return $delegation;
        });
    }

    public function revoke(RoleDelegation $delegation, User $caller): void
    {
        if ($delegation->status !== RoleDelegationStatus::Active && $delegation->status !== RoleDelegationStatus::Scheduled) {
            return; // Already revoked or expired
        }

        DB::transaction(function () use ($delegation, $caller) {
            $user = $delegation->user;
            $agency = $delegation->agency;

            $delegation->markRevoked($caller);
            $this->sync($user, $agency);

            event(new RoleDelegationRevoked($delegation));

            // Activity log
            activity()
                ->causedBy($caller)
                ->performedOn($delegation)
                ->withProperties(['role' => $delegation->role])
                ->log('role_delegation.revoked');
        });
    }

    public function activate(RoleDelegation $delegation): void
    {
        if ($delegation->status !== RoleDelegationStatus::Scheduled) {
            return; // Idempotent: only activate scheduled
        }

        DB::transaction(function () use ($delegation) {
            $user = $delegation->user;
            $agency = $delegation->agency;

            $delegation->markActive();
            $this->sync($user, $agency);

            event(new RoleDelegationActivated($delegation));

            // Activity log (system triggered)
            activity()
                ->causedBy($user) // System action, but we log the beneficiary as context
                ->performedOn($delegation)
                ->withProperties(['role' => $delegation->role, 'agency_id' => $agency->id])
                ->event('activated')
                ->log('role_delegation.activated');
        });
    }

    public function expire(RoleDelegation $delegation): void
    {
        if ($delegation->status !== RoleDelegationStatus::Active) {
            return; // Idempotent: only expire active
        }

        DB::transaction(function () use ($delegation) {
            $user = $delegation->user;
            $agency = $delegation->agency;

            $delegation->markExpired();
            $this->sync($user, $agency);

            event(new RoleDelegationExpired($delegation));

            // Activity log (system triggered)
            activity()
                ->causedBy($user)
                ->performedOn($delegation)
                ->withProperties(['role' => $delegation->role, 'agency_id' => $agency->id])
                ->event('expired')
                ->log('role_delegation.expired');
        });
    }

    /**
     * Canonical role syncer. Recalculates effective roles and updates Spatie.
     *
     * Algorithm:
     * 1. Get current pivot roles
     * 2. Get all roles ever delegated to this user in this agency
     * 3. Get currently active delegated roles
     * 4. Keep roles that are either:
     *    - Not in rolesEverDelegated (native roles)
     *    - In activeDelegRoles (still delegated)
     * 5. Add activeDelegRoles to the result
     */
    public function sync(User $user, Agency $agency): void
    {
        $this->registrar->setPermissionsTeamId($agency->id);

        $currentPivotRoles = collect($user->getRoleNames());
        $rolesEverDelegated = $user->roleDelegations()
            ->forAgency($agency->id)
            ->pluck('role')
            ->unique();
        $activeDelegRoles = $user->roleDelegations()
            ->active()
            ->forAgency($agency->id)
            ->pluck('role')
            ->unique();

        // Remove roles that were delegated but no longer have an active delegation
        // AND are not native (not in any delegation snapshot)
        $rolesToKeep = $currentPivotRoles
            ->reject(function ($role) use ($rolesEverDelegated, $activeDelegRoles, $user, $agency) {
                if (! $rolesEverDelegated->contains($role)) {
                    return false; // Never delegated, keep it (native)
                }
                if ($activeDelegRoles->contains($role)) {
                    return false; // Still active, keep it
                }

                // Role was delegated, no longer active. Check if it's native via any delegation snapshot
                $wasNative = $user->roleDelegations()
                    ->forAgency($agency->id)
                    ->where('role', $role)
                    ->whereJsonContains('user_native_roles_snapshot', $role)
                    ->exists();

                return ! $wasNative; // Remove if not native
            })
            ->merge($activeDelegRoles)
            ->unique()
            ->values()
            ->all();

        // Ensure roles exist in Spatie before syncing
        foreach ($rolesToKeep as $roleName) {
            Role::findOrCreate($roleName, 'web');
        }

        // Get current roles for comparison (using the team context)
        $currentRoles = $user->getRoleNames()->all();
        $rolesToAdd = array_diff($rolesToKeep, $currentRoles);
        $rolesToRemove = array_diff($currentRoles, $rolesToKeep);

        // Remove roles no longer needed
        foreach ($rolesToRemove as $roleName) {
            $role = Role::findByName($roleName, 'web');
            if ($role) {
                DB::table('model_has_roles')
                    ->where('model_id', $user->id)
                    ->where('model_type', User::class)
                    ->where('role_id', $role->id)
                    ->where('agency_id', $agency->id)
                    ->delete();
            }
        }

        // Add new roles
        foreach ($rolesToAdd as $roleName) {
            $role = Role::findByName($roleName, 'web');
            if ($role) {
                DB::table('model_has_roles')->insertOrIgnore([
                    'model_id' => $user->id,
                    'model_type' => User::class,
                    'role_id' => $role->id,
                    'agency_id' => $agency->id,
                ]);
            }
        }

        $user->load('roles', 'permissions');
        $this->registrar->forgetCachedPermissions();
    }
}
