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

/**
 * TCK-278 — Service profile-based, sans spatie.
 *
 * Le rôle d'un user est désormais la présence d'un profil polymorphe
 * (cf. Règle 5 du models-spec). Une `RoleDelegation` active accorde
 * temporairement les capacités d'un rôle additionnel à un user.
 *
 * La résolution d'autorisation se fait via :
 *   - `$user->isXxxAt($agencyId)` → présence de profil canonique
 *   - `$user->hasActiveAgencyDelegation($agencyId, $role)` → délégation active
 *
 * Ce service ne touche plus aux tables `model_has_roles` / `roles` :
 * la délégation est intégralement portée par la table `role_delegations`.
 */
class RoleDelegationService
{
    public function create(Agency $agency, User $delegator, array $data): RoleDelegation
    {
        $userId = $data['user_id'];
        $role = $data['role'];

        /** @var User $user */
        $user = User::findOrFail($userId);

        if ($user->id === $delegator->id) {
            throw ValidationException::withMessages([
                'user_id' => __('role_delegations.validation.self_delegation'),
            ]);
        }

        // TCK-146 — membership is profile-driven; the legacy single-agency
        // accessor is null for multi-profile users without an active context
        // and would falsely reject an otherwise-valid delegation target.
        if (! $user->isAgentAt($agency->id) && ! $user->isOwnerAt($agency->id)) {
            throw ValidationException::withMessages([
                'user_id' => __('role_delegations.validation.user_not_in_agency'),
            ]);
        }

        if ($role === 'agency_admin') {
            $isPrimaryAdminOfAnyAgency = Agency::where('primary_admin_id', $user->id)->exists();
            if ($isPrimaryAdminOfAnyAgency) {
                throw ValidationException::withMessages([
                    'role' => __('role_delegations.validation.already_primary_admin'),
                ]);
            }
        }

        return DB::transaction(function () use ($agency, $delegator, $user, $data) {
            $startsAt = $data['starts_at'] ?? null;
            $isImmediate = is_null($startsAt) || now()->gte($startsAt);

            $status = $isImmediate ? RoleDelegationStatus::Active : RoleDelegationStatus::Scheduled;

            // TCK-278 — Snapshot des « rôles natifs » : on enregistre la
            // liste des profils polymorphes que le user détient déjà dans
            // l'agence. Audit-only ; ne change pas la résolution
            // d'autorisation (toujours profile-based).
            $nativeRoles = $this->nativeProfileTypes($user, $agency);

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

            if ($isImmediate) {
                event(new RoleDelegationActivated($delegation));
            }

            event(new RoleDelegationCreated($delegation));

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
            return;
        }

        DB::transaction(function () use ($delegation, $caller) {
            $delegation->markRevoked($caller);

            event(new RoleDelegationRevoked($delegation));

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
            return;
        }

        DB::transaction(function () use ($delegation) {
            $delegation->markActive();

            event(new RoleDelegationActivated($delegation));

            activity()
                ->causedBy($delegation->user)
                ->performedOn($delegation)
                ->withProperties(['role' => $delegation->role, 'agency_id' => $delegation->agency_id])
                ->event('activated')
                ->log('role_delegation.activated');
        });
    }

    public function expire(RoleDelegation $delegation): void
    {
        if ($delegation->status !== RoleDelegationStatus::Active) {
            return;
        }

        DB::transaction(function () use ($delegation) {
            $delegation->markExpired();

            event(new RoleDelegationExpired($delegation));

            activity()
                ->causedBy($delegation->user)
                ->performedOn($delegation)
                ->withProperties(['role' => $delegation->role, 'agency_id' => $delegation->agency_id])
                ->event('expired')
                ->log('role_delegation.expired');
        });
    }

    /**
     * @return list<string> Liste des « rôles natifs » du user dans l'agence,
     *                      dérivée de la présence de profils polymorphes.
     */
    private function nativeProfileTypes(User $user, Agency $agency): array
    {
        $types = [];
        if ($user->isAgencyAdminAt((int) $agency->id)) {
            $types[] = 'agency_admin';
        }
        if ($user->isAgentAt((int) $agency->id)) {
            $types[] = 'agent';
        }
        if ($user->isOwnerAt((int) $agency->id)) {
            $types[] = 'owner';
        }

        return $types;
    }
}
