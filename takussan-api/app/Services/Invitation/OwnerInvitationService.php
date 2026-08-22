<?php

namespace App\Services\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Support\CaseInsensitive;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * TCK-256 — orchestrates the owner invitation flow from the agency-side
 * surface.
 *
 * Wraps {@see InvitationService} so the per-role business rules live
 * in *one* dedicated entry point instead of leaking into the generic
 * invitation controller:
 *
 *  - `Agency.kind === standard` gate (TCK-248). `individual` agencies
 *    don't have a portfolio of distinct owners and cannot invite.
 *  - `invite_owner` gate, scoped to the agency (TCK-278 — a profile-based
 *    check, not a spatie permission on a team_id: the package is
 *    uninstalled, ADR-0002). Held by `agency_admin`, optionally delegated
 *    to an `agent` via {@see RoleDelegation}.
 *  - Pre-creates an `OwnerProfile` in `OwnerProfileStatus::Draft` linked
 *    to the agency. The first/last/phone/owner_type payload lands in
 *    `metadata` until acceptance promotes it onto a real `User` row.
 *  - Conflict guard: if the email already maps to an OwnerProfile
 *    *attached to a User* in this agency, throws 409. A pre-existing
 *    `draft` for the same email is not blocked — the inviter can resend
 *    via the invitation endpoint instead.
 *  - Activity log: `owner_invited` event with inviter_id, agency_id,
 *    target_email properties.
 */
class OwnerInvitationService
{
    public const PERMISSION = 'invite_owner';

    public function __construct(private readonly InvitationService $invitations) {}

    /**
     * @param  array{email:string, first_name:string, last_name:string, phone?:string|null, owner_type:string, company_name?:string|null}  $data
     *
     * @throws HttpException 403 if agency.kind != standard or inviter
     *                       lacks the `invite_owner` permission.
     * @throws HttpException 409 if a User+OwnerProfile already exists
     *                       in this agency for the email.
     * @throws ValidationException 422 if the payload is internally
     *                             inconsistent (e.g. company without name).
     */
    public function invite(Agency $agency, User $inviter, array $data): Invitation
    {
        $this->assertAgencyCanInvite($agency);
        $this->assertInviterCanInvite($inviter, $agency);

        $email = CaseInsensitive::fold(trim((string) $data['email']));
        $ownerType = (string) ($data['owner_type'] ?? 'individual');

        if ($ownerType === 'company' && empty(trim((string) ($data['company_name'] ?? '')))) {
            throw ValidationException::withMessages([
                'company_name' => [__('owners.invite.errors.company_name_required')],
            ])->status(422);
        }

        $this->assertNoActiveOwnerInAgency($agency, $email);

        return DB::transaction(function () use ($agency, $inviter, $email, $ownerType, $data): Invitation {
            $profile = OwnerProfile::query()->create([
                'user_id' => null,
                'agency_id' => $agency->id,
                'status' => OwnerProfileStatus::Draft->value,
                'metadata' => [
                    'email' => $email,
                    'first_name' => trim((string) ($data['first_name'] ?? '')),
                    'last_name' => trim((string) ($data['last_name'] ?? '')),
                    'phone' => $this->cleanString($data['phone'] ?? null),
                    'owner_type' => $ownerType,
                    'company_name' => $ownerType === 'company'
                        ? trim((string) ($data['company_name'] ?? ''))
                        : null,
                    'invited_by' => $inviter->id,
                ],
            ]);

            $invitation = $this->invitations->send([
                'email' => $email,
                'role' => 'owner',
                'invitable_type' => OwnerProfile::class,
                'invitable_id' => $profile->id,
                'agency_id' => $agency->id,
                'metadata' => [
                    'first_name' => trim((string) ($data['first_name'] ?? '')),
                    'last_name' => trim((string) ($data['last_name'] ?? '')),
                    'owner_type' => $ownerType,
                ],
            ], $inviter);

            activity('Invitation')
                ->performedOn($invitation)
                ->causedBy($inviter)
                ->withProperties([
                    'inviter_id' => $inviter->id,
                    'agency_id' => $agency->id,
                    'target_email' => $email,
                    'owner_profile_id' => $profile->id,
                ])
                ->event('owner_invited')
                ->log('owner_invited');

            return $invitation;
        });
    }

    /**
     * Throws 403 if the agency is not `standard`. Individual agencies
     * are sole-host hosts (TCK-248) and don't manage a portfolio of
     * external owners.
     */
    protected function assertAgencyCanInvite(Agency $agency): void
    {
        $kind = $agency->kind instanceof AgencyKind
            ? $agency->kind
            : AgencyKind::tryFrom((string) $agency->kind);

        if ($kind !== AgencyKind::Standard) {
            throw new HttpException(403, __('owners.invite.errors.individual_agency'));
        }
    }

    /**
     * Throws 403 unless the inviter may invite owners **in this agency**.
     *
     * TCK-278 — the check is profile-based and the agency id is passed
     * explicitly to `isAgencyAdminAt()`. It used to read « we pin the spatie
     * team_id to the agency before the probe »; there is no team_id and no
     * spatie any more (ADR-0002). The intent survives the mechanism: an
     * `agency_admin` of a DIFFERENT agency must not pass this gate — which is
     * exactly what the explicit `$agency->id` argument enforces.
     *
     * super_admin bypasses via the global Gate::before hook (handled by
     * `$user->can(...)` callers) — this service is reachable from the
     * agency-scoped controller only, so we re-probe defensively here.
     */
    protected function assertInviterCanInvite(User $inviter, Agency $agency): void
    {
        if (method_exists($inviter, 'isSuperAdmin') && $inviter->isSuperAdmin()) {
            return;
        }

        // TCK-278 — Profile-based check (cf. policy).
        $allowed = $inviter->isAgencyAdminAt((int) $agency->id)
            || $inviter->hasActiveAgencyDelegation((int) $agency->id, 'agency_admin');

        if (! $allowed) {
            throw new HttpException(403, __('owners.invite.errors.permission_denied'));
        }
    }

    /**
     * Throws 409 if an OwnerProfile already exists for this email in the
     * agency *with a User attached* (i.e. the owner has already accepted
     * a previous invitation, or was added directly by the agency).
     *
     * A standalone `draft` (no User yet) is *not* blocked — the inviter
     * is meant to use the invitation resend flow instead, and we surface
     * the existing draft id in the error so the UI can propose it.
     */
    protected function assertNoActiveOwnerInAgency(Agency $agency, string $email): void
    {
        $existing = OwnerProfile::query()
            ->where('agency_id', $agency->id)
            ->whereHas('user', function ($query) use ($email): void {
                $query->whereRaw(CaseInsensitive::sql('email').' = ?', [CaseInsensitive::fold($email)]);
            })
            ->first();

        if ($existing !== null) {
            throw new HttpException(
                409,
                __('owners.invite.errors.already_member', ['profile_id' => $existing->id]),
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
