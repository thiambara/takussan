<?php

namespace App\Services\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * TCK-258 — orchestrates the agent invitation / suspension / removal
 * flow from the agency-side "Équipe" surface.
 *
 * Wraps {@see InvitationService} so the per-role business rules live
 * in *one* dedicated entry point instead of leaking into the generic
 * invitation controller:
 *
 *  - `Agency.kind === standard` gate (TCK-248). `individual` agencies
 *    don't have a team — they are sole-host.
 *  - `manage_team` spatie permission scoped to the agency team_id
 *    (delegated automatically to `agency_admin`, optionally to a senior
 *    agent via {@see RoleDelegation}).
 *  - Pre-creates an `AgentProfile` in `AgentProfileStatus::Draft` linked
 *    to the agency. The first/last/phone payload lands in `metadata`
 *    until acceptance promotes it onto a real `User` row.
 *  - Conflict guard: if the email already maps to an active AgentProfile
 *    in this agency (i.e. the agent has already accepted, or was added
 *    directly), throws 409.
 *  - Activity log: `agent_invited`, `agent_suspended`, `agent_removed`.
 */
class AgentInvitationService
{
    public const PERMISSION = 'manage_team';

    /**
     * Roles assignable when inviting through the team management surface.
     * `agency_admin` is intentionally absent — promoting/creating other
     * admins lives in a separate, more-restricted flow (TCK-209).
     */
    public const ALLOWED_ROLES = ['agent', 'agent_senior', 'agent_manager'];

    public function __construct(private readonly InvitationService $invitations) {}

    /**
     * @param  array{email:string, role:string, first_name:string, last_name:string, phone?:string|null}  $data
     *
     * @throws HttpException 403 if agency.kind != standard or inviter
     *                       lacks the `manage_team` permission.
     * @throws HttpException 409 if a User+AgentProfile already exists
     *                       in this agency for the email.
     * @throws ValidationException 422 if the role is not in the allowed
     *                             set.
     */
    public function invite(Agency $agency, User $inviter, array $data): Invitation
    {
        $this->assertAgencyCanInvite($agency);
        $this->assertInviterCanManageTeam($inviter, $agency);

        $email = strtolower(trim((string) $data['email']));
        $role = (string) ($data['role'] ?? 'agent');

        if (! in_array($role, self::ALLOWED_ROLES, true)) {
            throw ValidationException::withMessages([
                'role' => [__('team.invite.errors.invalid_role')],
            ])->status(422);
        }

        $this->assertNoActiveAgentInAgency($agency, $email);

        return DB::transaction(function () use ($agency, $inviter, $email, $role, $data): Invitation {
            $profile = AgentProfile::query()->create([
                'user_id' => null,
                'agency_id' => $agency->id,
                'status' => AgentProfileStatus::Draft->value,
                'metadata' => [
                    'email' => $email,
                    'first_name' => trim((string) ($data['first_name'] ?? '')),
                    'last_name' => trim((string) ($data['last_name'] ?? '')),
                    'phone' => $this->cleanString($data['phone'] ?? null),
                    'invited_role' => $role,
                    'invited_by' => $inviter->id,
                ],
            ]);

            $invitation = $this->invitations->send([
                'email' => $email,
                'role' => $role,
                'invitable_type' => AgentProfile::class,
                'invitable_id' => $profile->id,
                'agency_id' => $agency->id,
                'metadata' => [
                    'first_name' => trim((string) ($data['first_name'] ?? '')),
                    'last_name' => trim((string) ($data['last_name'] ?? '')),
                ],
            ], $inviter);

            activity('Invitation')
                ->performedOn($invitation)
                ->causedBy($inviter)
                ->withProperties([
                    'inviter_id' => $inviter->id,
                    'agency_id' => $agency->id,
                    'target_email' => $email,
                    'agent_profile_id' => $profile->id,
                    'role' => $role,
                ])
                ->event('agent_invited')
                ->log('agent_invited');

            return $invitation;
        });
    }

    /**
     * Toggle suspension on an existing agent profile. When `$active` is
     * true, the profile is reactivated (status → active). Activity log
     * captures `agent_suspended` or `agent_reactivated` accordingly.
     */
    public function suspend(AgentProfile $profile, User $actor, bool $active = false): AgentProfile
    {
        $agency = $profile->agency;
        if ($agency !== null) {
            $this->assertAgencyCanInvite($agency);
            $this->assertInviterCanManageTeam($actor, $agency);
        }

        $newStatus = $active
            ? AgentProfileStatus::Active->value
            : AgentProfileStatus::Suspended->value;

        DB::transaction(function () use ($profile, $actor, $newStatus, $active): void {
            $profile->forceFill(['status' => $newStatus])->save();

            activity('Invitation')
                ->performedOn($profile)
                ->causedBy($actor)
                ->withProperties([
                    'actor_id' => $actor->id,
                    'agency_id' => $profile->agency_id,
                    'agent_profile_id' => $profile->id,
                ])
                ->event($active ? 'agent_reactivated' : 'agent_suspended')
                ->log($active ? 'agent_reactivated' : 'agent_suspended');
        });

        return $profile->fresh();
    }

    /**
     * Soft-delete the agent profile so the historique reste consultable.
     * The user account itself is left untouched — only the membership in
     * this agency is archived.
     */
    public function remove(AgentProfile $profile, User $actor): void
    {
        $agency = $profile->agency;
        if ($agency !== null) {
            $this->assertAgencyCanInvite($agency);
            $this->assertInviterCanManageTeam($actor, $agency);
        }

        DB::transaction(function () use ($profile, $actor): void {
            activity('Invitation')
                ->performedOn($profile)
                ->causedBy($actor)
                ->withProperties([
                    'actor_id' => $actor->id,
                    'agency_id' => $profile->agency_id,
                    'agent_profile_id' => $profile->id,
                ])
                ->event('agent_removed')
                ->log('agent_removed');

            $profile->delete();
        });
    }

    /**
     * Throws 403 if the agency is not `standard`. Individual agencies
     * are sole-host (TCK-248) and don't manage a team.
     */
    protected function assertAgencyCanInvite(Agency $agency): void
    {
        $kind = $agency->kind instanceof AgencyKind
            ? $agency->kind
            : AgencyKind::tryFrom((string) $agency->kind);

        if ($kind !== AgencyKind::Standard) {
            throw new HttpException(403, __('team.invite.errors.individual_agency'));
        }
    }

    /**
     * Throws 403 unless the actor holds `manage_team` *in the agency
     * team context*. Mirrors the OwnerInvitationService probe so a user
     * with the permission elsewhere doesn't accidentally pass on a
     * different agency.
     */
    protected function assertInviterCanManageTeam(User $actor, Agency $agency): void
    {
        if (method_exists($actor, 'isSuperAdmin') && $actor->isSuperAdmin()) {
            return;
        }

        // TCK-278 — Profile-based check (cf. policy).
        $allowed = $actor->isAgencyAdminAt((int) $agency->id)
            || $actor->hasActiveAgencyDelegation((int) $agency->id, 'agency_admin');

        if (! $allowed) {
            throw new HttpException(403, __('team.invite.errors.permission_denied'));
        }
    }

    /**
     * Throws 409 if an AgentProfile already exists for this email in the
     * agency *with a User attached* (i.e. the agent has already accepted
     * a previous invitation, or was added directly).
     */
    protected function assertNoActiveAgentInAgency(Agency $agency, string $email): void
    {
        $existing = AgentProfile::query()
            ->where('agency_id', $agency->id)
            ->whereHas('user', function ($query) use ($email): void {
                $query->whereRaw('LOWER(email) = ?', [$email]);
            })
            ->first();

        if ($existing !== null) {
            throw new HttpException(
                409,
                __('team.invite.errors.already_member', ['profile_id' => $existing->id]),
            );
        }
    }

    protected function cleanString(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
