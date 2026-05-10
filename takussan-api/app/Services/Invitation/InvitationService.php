<?php

namespace App\Services\Invitation;

use App\Mail\InvitationMailable;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use App\Notifications\InvitationAcceptedNotification;
use App\Notifications\InvitationExpiredNotification;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * TCK-249 — orchestrates the unified invitation lifecycle.
 *
 * One service, one transaction per state transition, one activity log entry
 * per transition. Public methods are the *only* legal entry points for
 * mutating an Invitation — controllers, FormRequests, jobs and the cron
 * commands all delegate here so business rules (dedup, transactional accept,
 * idempotent reminder, role scoping) live in exactly one place.
 *
 * State machine:
 *
 *     send()  ──▶  sent ──▶ accept()  ──▶ accepted   (terminal)
 *                    │
 *                    ├──▶  revoke()  ──▶ revoked     (terminal)
 *                    │
 *                    └──▶  expire()  ──▶ expired     (terminal, cron-driven)
 *                              │
 *                              └─ remindIfDue() may fire once between sent
 *                                 and expired (idempotent via last_reminded_at)
 */
class InvitationService
{
    /**
     * Default token lifetime (days). Kept here so the cron + the controller
     * + the resend path all agree.
     */
    public const DEFAULT_TTL_DAYS = 7;

    /**
     * Reminder offset (days after `created_at`). Cron `invitations:remind`
     * fires once per invitation, idempotent on `last_reminded_at`.
     */
    public const REMINDER_OFFSET_DAYS = 2;

    /**
     * Send a new invitation.
     *
     * Pre-conditions:
     *  - email is RFC-valid (handled by the FormRequest)
     *  - inviter has the `invite_<role>` permission OR is super_admin
     *    (the controller / policy enforces this — the service trusts the
     *    caller for permission, but still guards data integrity below)
     *
     * Behaviour:
     *  - Generates a 64-char URL-safe token, retries on the (extremely
     *    unlikely) collision rather than relying on UNIQUE-violation
     *    bubbling up to the user.
     *  - If the (email, invitable_type, agency_id) tuple already has a
     *    `sent` invitation, throws an HTTP 409 — the caller's UI must
     *    instruct the inviter to use "resend" instead.
     *  - If `email` already maps to a `User` row, links it via
     *    `invited_user_id` so the accept flow can short-circuit to "login
     *    + accept".
     *  - Sends the localized email transactionally via the Mailable.
     *  - Logs an `invitation_sent` activity row.
     *
     * @param  array<string,mixed>  $payload
     */
    public function send(array $payload, User $inviter): Invitation
    {
        $email = strtolower(trim((string) $payload['email']));
        $role = (string) $payload['role'];
        $invitableType = $payload['invitable_type'] ?? null;
        $invitableId = $payload['invitable_id'] ?? null;
        $agencyId = $payload['agency_id'] ?? null;
        $metadata = $payload['metadata'] ?? null;

        // Dedup guard: a pending `sent` invitation for the same
        // (email, invitable_type, agency_id) tuple is a 409 — the caller
        // is supposed to call `resend()` on the existing one instead.
        $existing = Invitation::query()
            ->where('email', $email)
            ->where('status', InvitationStatus::Sent->value)
            ->where('invitable_type', $invitableType)
            ->where('agency_id', $agencyId)
            ->first();

        if ($existing !== null) {
            // 409 Conflict (HttpException, picked up by the framework's
            // exception renderer). We surface the existing id so the UI
            // can offer a one-click "resend" without a second round-trip.
            throw new HttpException(
                409,
                __('invitations.errors.duplicate_pending', ['id' => $existing->id]),
            );
        }

        $existingUser = User::query()->where('email', $email)->first();

        $invitation = DB::transaction(function () use (
            $email, $role, $invitableType, $invitableId, $agencyId, $metadata, $inviter, $existingUser
        ): Invitation {
            $invitation = Invitation::query()->create([
                'token' => $this->generateUniqueToken(),
                'email' => $email,
                'invited_user_id' => $existingUser?->id,
                'invited_by' => $inviter->id,
                'invitable_type' => $invitableType,
                'invitable_id' => $invitableId,
                'agency_id' => $agencyId,
                'role' => $role,
                'status' => InvitationStatus::Sent->value,
                'expires_at' => now()->addDays(self::DEFAULT_TTL_DAYS),
                'metadata' => $metadata,
            ]);

            activity('Invitation')
                ->performedOn($invitation)
                ->causedBy($inviter)
                ->withProperties([
                    'email' => $email,
                    'role' => $role,
                    'agency_id' => $agencyId,
                ])
                ->event('invitation_sent')
                ->log('invitation_sent');

            return $invitation;
        });

        // Mail send is intentionally *outside* the DB transaction — a
        // transient SMTP failure shouldn't roll back the freshly persisted
        // invitation row (the inviter can `resend` later without losing
        // state). Queueing the mailable would push the failure surface
        // even further away from the request.
        Mail::to($email)->locale($this->preferredLocale($existingUser, $invitation))
            ->send(new InvitationMailable($invitation));

        return $invitation;
    }

    /**
     * Accept an invitation given its public token.
     *
     * Two flows depending on whether the email already maps to a User:
     *
     *  A. New user: create the User row (random password — they'll set
     *     one via the post-acceptance wizard / password reset), attach the
     *     spatie role under the invitation's `agency_id` team, flip the
     *     polymorphic profile to `active` if it carries a status enum,
     *     flip Invitation → `accepted`. All in one transaction — any
     *     failure rolls the whole thing back, leaving the invitation in
     *     `sent` so the inviter can resend / the recipient can retry.
     *
     *  B. Existing user: refuse the public accept and return 401 with
     *     `requires_login=true`. The caller is expected to log in first
     *     and re-hit the endpoint with their bearer token; that path is
     *     handled by `acceptForAuthenticatedUser()` below.
     *
     * @param  array<string,mixed>  $payload  optional `first_name`,
     *                                        `last_name`, `password` for
     *                                        the new-user branch.
     */
    public function accept(string $token, array $payload = [], ?User $authenticated = null): Invitation
    {
        $invitation = $this->lookupActiveInvitation($token);
        $existingUser = User::query()->where('email', $invitation->email)->first();

        if ($existingUser !== null) {
            // Branch B — caller must authenticate first.
            if ($authenticated === null || $authenticated->id !== $existingUser->id) {
                // Surface the email back so the UI can pre-fill the login
                // form and the wizard can resume on the right account.
                abort(401, __('invitations.errors.requires_login'), [
                    'X-Invitation-Email' => $invitation->email,
                    'X-Invitation-Requires-Login' => '1',
                ]);
            }

            return $this->acceptForUser($invitation, $existingUser);
        }

        // Branch A — create the User as part of the accept transaction.
        return $this->acceptAsNewUser($invitation, $payload);
    }

    /**
     * Accept on behalf of an already-authenticated user. Used by the
     * frontend after a "requires_login" round-trip.
     */
    public function acceptForAuthenticatedUser(string $token, User $user): Invitation
    {
        $invitation = $this->lookupActiveInvitation($token);

        if (strtolower(trim($user->email)) !== $invitation->email) {
            abort(403, __('invitations.errors.email_mismatch'));
        }

        return $this->acceptForUser($invitation, $user);
    }

    /**
     * Revoke a `sent` invitation. Idempotent: revoking an already-revoked
     * row is a no-op; revoking an `accepted` row throws 422.
     */
    public function revoke(Invitation $invitation, User $actor): Invitation
    {
        if ($invitation->status === InvitationStatus::Revoked) {
            return $invitation;
        }

        if ($invitation->status === InvitationStatus::Accepted) {
            throw ValidationException::withMessages([
                'status' => [__('invitations.errors.already_accepted')],
            ])->status(422);
        }

        DB::transaction(function () use ($invitation, $actor): void {
            $invitation->forceFill([
                'status' => InvitationStatus::Revoked->value,
                'revoked_at' => now(),
            ])->save();

            activity('Invitation')
                ->performedOn($invitation)
                ->causedBy($actor)
                ->event('invitation_revoked')
                ->log('invitation_revoked');
        });

        return $invitation->fresh();
    }

    /**
     * Resend: regenerate token, push `expires_at` forward by the default
     * TTL, clear the reminder marker (so the recipient gets one again at
     * J+2 from "now") and re-send the email. Only valid on `sent` rows.
     */
    public function resend(Invitation $invitation, User $actor): Invitation
    {
        if ($invitation->status !== InvitationStatus::Sent) {
            throw ValidationException::withMessages([
                'status' => [__('invitations.errors.cannot_resend')],
            ])->status(422);
        }

        DB::transaction(function () use ($invitation): void {
            $invitation->forceFill([
                'token' => $this->generateUniqueToken(),
                'expires_at' => now()->addDays(self::DEFAULT_TTL_DAYS),
                'last_reminded_at' => null,
            ])->save();
        });

        $invitation->refresh();
        $existingUser = User::query()->where('email', $invitation->email)->first();
        Mail::to($invitation->email)
            ->locale($this->preferredLocale($existingUser, $invitation))
            ->send(new InvitationMailable($invitation));

        activity('Invitation')
            ->performedOn($invitation)
            ->causedBy($actor)
            ->event('invitation_resent')
            ->log('invitation_resent');

        return $invitation;
    }

    /**
     * Cron entry-point: flip every `sent` invitation whose `expires_at` is
     * in the past to `expired`, notify the inviter, and write an activity
     * row. Idempotent — already-expired rows are skipped by the scope.
     *
     * @return Collection<int,Invitation>
     */
    public function expire(?Carbon $now = null): Collection
    {
        $now ??= now();

        $stale = Invitation::query()
            ->where('status', InvitationStatus::Sent->value)
            ->where('expires_at', '<=', $now)
            ->get();

        foreach ($stale as $invitation) {
            DB::transaction(function () use ($invitation): void {
                $invitation->forceFill([
                    'status' => InvitationStatus::Expired->value,
                ])->save();

                activity('Invitation')
                    ->performedOn($invitation)
                    ->event('invitation_expired')
                    ->log('invitation_expired');
            });

            $inviter = User::query()->find($invitation->invited_by);
            if ($inviter !== null) {
                $inviter->notify(new InvitationExpiredNotification($invitation));
            }
        }

        return $stale;
    }

    /**
     * Send a J+2 reminder to invitees who haven't accepted yet. Idempotent
     * via `last_reminded_at` — the second pass is a no-op for any
     * invitation already reminded.
     *
     * @return Collection<int,Invitation>
     */
    public function remindPending(?Carbon $now = null): Collection
    {
        $now ??= now();
        $threshold = $now->copy()->subDays(self::REMINDER_OFFSET_DAYS);

        $due = Invitation::query()
            ->where('status', InvitationStatus::Sent->value)
            ->where('created_at', '<=', $threshold)
            ->where('expires_at', '>', $now)
            ->whereNull('last_reminded_at')
            ->get();

        foreach ($due as $invitation) {
            $existingUser = User::query()->where('email', $invitation->email)->first();
            Mail::to($invitation->email)
                ->locale($this->preferredLocale($existingUser, $invitation))
                ->send(new InvitationMailable($invitation, isReminder: true));

            $invitation->forceFill(['last_reminded_at' => $now])->save();
        }

        return $due;
    }

    /**
     * Look up by token + assert the invitation is still actionable
     * (status=sent + expires_at in the future). Returns 404 for unknown
     * tokens, 410 for expired/revoked/accepted ones — discriminated so
     * the frontend can show a specific message.
     */
    protected function lookupActiveInvitation(string $token): Invitation
    {
        /** @var Invitation|null $invitation */
        $invitation = Invitation::query()->where('token', $token)->first();
        if ($invitation === null) {
            abort(404, __('invitations.errors.token_not_found'));
        }

        if ($invitation->status !== InvitationStatus::Sent) {
            abort(410, __('invitations.errors.token_'.$invitation->status->value));
        }

        if ($invitation->expires_at !== null && $invitation->expires_at->isPast()) {
            abort(410, __('invitations.errors.token_expired'));
        }

        return $invitation;
    }

    /**
     * Branch A: create User + run the shared accept flow.
     *
     * @param  array<string,mixed>  $payload
     */
    protected function acceptAsNewUser(Invitation $invitation, array $payload): Invitation
    {
        return DB::transaction(function () use ($invitation, $payload): Invitation {
            $user = User::query()->create([
                'first_name' => $payload['first_name'] ?? '',
                'last_name' => $payload['last_name'] ?? '',
                'email' => $invitation->email,
                'password' => isset($payload['password'])
                    ? bcrypt((string) $payload['password'])
                    // No password provided → mint a random one. The user
                    // either picks one in the post-accept wizard or via a
                    // password-reset email. Keeps the User row DB-valid
                    // without leaking auth-bypass semantics.
                    : bcrypt(Str::random(40)),
                'email_verified_at' => now(),
            ]);

            return $this->finalizeAccept($invitation, $user);
        });
    }

    /**
     * Branch B: shared finalize when the User already exists.
     */
    protected function acceptForUser(Invitation $invitation, User $user): Invitation
    {
        return DB::transaction(function () use ($invitation, $user): Invitation {
            return $this->finalizeAccept($invitation, $user);
        });
    }

    /**
     * Single source of truth for the "happy path" tail: attach the role
     * (scoped to agency_id), flip the polymorphic profile, flip the
     * invitation, log activity, notify the inviter. The whole tail is
     * called from inside an outer transaction so a failure here rolls
     * the User creation back too.
     */
    protected function finalizeAccept(Invitation $invitation, User $user): Invitation
    {
        // Spatie role scoping: super_admin lives at team_id=null, every
        // other role lives at team_id=agency_id. Match the same pattern
        // used by AgencyController::addAgent so the role probes are
        // consistent across surfaces.
        $registrar = app(PermissionRegistrar::class);
        $previousTeamId = $registrar->getPermissionsTeamId();
        $teamId = $invitation->role === 'super_admin' ? null : $invitation->agency_id;
        $registrar->setPermissionsTeamId($teamId);

        try {
            Role::findOrCreate($invitation->role, 'web');
            $user->unsetRelation('roles');
            if (! $user->hasRole($invitation->role)) {
                $user->assignRole($invitation->role);
            }
        } finally {
            $registrar->setPermissionsTeamId($previousTeamId);
            $user->unsetRelation('roles');
        }

        // Flip the polymorphic profile to `active` if it exists and
        // exposes a `status` attribute.
        //
        // TCK-261 — for a draft ServiceProviderProfile (created sans User
        // by ServiceProviderInvitationService), we additionally attach
        // the freshly-known User so the post-acceptance wizard can write
        // to /api/me/profiles/{sp_profile}/* with a clean ownership check.
        // TCK-257 — same treatment for OwnerProfile drafts created by
        // OwnerInvitationService (user_id null until acceptance).
        $invitable = $invitation->invitable;
        if ($invitable !== null) {
            $patch = [];
            if (array_key_exists('status', $invitable->getAttributes())) {
                // Use a string literal rather than ProfileStatus::Active->value
                // so this stays decoupled from any specific profile enum —
                // every profile-status enum we ship uses the same `active`
                // string for the active state.
                $patch['status'] = 'active';
            }
            if (in_array($invitation->role, ['service_provider', 'owner'], true)
                && array_key_exists('user_id', $invitable->getAttributes())
                && $invitable->user_id === null) {
                $patch['user_id'] = $user->id;
            }
            if ($patch !== []) {
                $invitable->forceFill($patch)->save();
            }
        }

        // TCK-262 — Multi-agency Service Provider attach. When the SP
        // already had a profile (re-used by ServiceProviderInvitationService
        // for an invitation from a *different* agency), no draft
        // collaboration was created at invite time. We create the active
        // collaboration here, atomically with the invitation acceptance.
        // 409 if the SP is already actively attached to this agency.
        if ($invitation->role === 'service_provider'
            && $invitable instanceof ServiceProviderProfile
            && $invitation->agency_id !== null
            && (int) $invitable->user_id === (int) $user->id) {
            $this->ensureServiceProviderCollaboration($invitable, $invitation, $user);
        }

        $invitation->forceFill([
            'status' => InvitationStatus::Accepted->value,
            'accepted_at' => now(),
            'invited_user_id' => $user->id,
        ])->save();

        activity('Invitation')
            ->performedOn($invitation)
            ->causedBy($user)
            ->withProperties([
                'role' => $invitation->role,
                'agency_id' => $invitation->agency_id,
            ])
            ->event('invitation_accepted')
            ->log('invitation_accepted');

        $inviter = $invitation->inviter;
        if ($inviter !== null) {
            $inviter->notify(new InvitationAcceptedNotification($invitation->fresh()));
        }

        return $invitation->fresh();
    }

    /**
     * TCK-262 — make sure the SP profile carries an active collaboration
     * with the invitation's agency. Idempotent on the (sp_profile, agency)
     * tuple:
     *   - no row → create active collab + log `sp_collaboration_added`.
     *   - existing active row → 409 (already attached, don't accept twice).
     *   - existing paused/ended row → reactivate (used by the standard
     *     TCK-260 flow: the draft collab is already paused, the wizard
     *     bumps it to active via ServiceProviderOnboardingService — but
     *     when the invitation is being accepted by an *existing* SP user
     *     we run this short-circuit instead).
     */
    protected function ensureServiceProviderCollaboration(
        ServiceProviderProfile $profile,
        Invitation $invitation,
        User $user,
    ): void {
        $existing = ServiceProviderAgencyCollaboration::query()
            ->where('service_provider_profile_id', $profile->id)
            ->where('agency_id', $invitation->agency_id)
            ->first();

        if ($existing !== null && $existing->status === CollaborationStatus::Active) {
            throw new HttpException(
                409,
                __('service_providers.invite.errors.already_member', ['profile_id' => $profile->id]),
            );
        }

        if ($existing !== null) {
            $existing->forceFill([
                'status' => CollaborationStatus::Active->value,
                'started_at' => $existing->started_at ?? now()->toDateString(),
                'ended_at' => null,
            ])->save();
            $collaboration = $existing;
        } else {
            $collaboration = ServiceProviderAgencyCollaboration::query()->create([
                'service_provider_profile_id' => $profile->id,
                'agency_id' => $invitation->agency_id,
                'status' => CollaborationStatus::Active->value,
                'started_at' => now()->toDateString(),
                'metadata' => [
                    'invited_by' => $invitation->invited_by,
                    'invitation_id' => $invitation->id,
                ],
            ]);
        }

        activity('ServiceProviderCollaboration')
            ->performedOn($collaboration)
            ->causedBy($user)
            ->withProperties([
                'service_provider_profile_id' => $profile->id,
                'agency_id' => $invitation->agency_id,
                'invitation_id' => $invitation->id,
            ])
            ->event('sp_collaboration_added')
            ->log('sp_collaboration_added');
    }

    /**
     * Generate a random URL-safe token and ensure DB uniqueness. The
     * birthday probability of collision on a 64-char alnum token is
     * negligible, but the retry loop costs us a single SELECT in the
     * common case and saves us from leaking a UNIQUE-violation 500 on
     * the (vanishing) collision case.
     */
    protected function generateUniqueToken(): string
    {
        do {
            $token = Str::random(64);
        } while (Invitation::query()->where('token', $token)->exists());

        return $token;
    }

    /**
     * Resolve the locale to render the email/notifications in.
     *
     * Order:
     *  1. Existing User's `preferred_language` if we have one.
     *  2. `metadata.locale` on the invitation (caller hint).
     *  3. App default.
     */
    protected function preferredLocale(?User $user, Invitation $invitation): string
    {
        return $user?->preferred_language
            ?? (string) (data_get($invitation->metadata, 'locale') ?? config('app.locale'));
    }
}
