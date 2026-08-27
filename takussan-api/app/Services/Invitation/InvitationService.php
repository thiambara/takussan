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
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
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
        $email = CaseInsensitive::fold(trim((string) $payload['email']));
        $role = (string) $payload['role'];
        $invitableType = $payload['invitable_type'] ?? null;
        $invitableId = $payload['invitable_id'] ?? null;
        $agencyId = $payload['agency_id'] ?? null;
        $metadata = $payload['metadata'] ?? null;

        // Dedup guard: a pending `sent` invitation for the same
        // (email, invitable_type, agency_id) tuple is a 409 — the caller
        // is supposed to call `resend()` on the existing one instead.
        //
        // TCK-368 — le couple gardé s'écrit UNE fois, dans
        // {@see self::liveSlotOccupant()} : la relance interroge le même
        // créneau avant de ressusciter une ligne périmée, et deux
        // expressions du même couple auraient divergé.
        $existing = $this->liveSlotOccupant($email, $invitableType, $agencyId);

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
     *     one via the post-acceptance wizard / password reset), then flip
     *     the polymorphic profile carried by the invitation to `active` if
     *     it has a status enum (TCK-278 — there is no spatie role to attach
     *     under an `agency_id` team any more: the profile IS the role,
     *     ADR-0002),
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

        if (CaseInsensitive::fold(trim($user->email)) !== $invitation->email) {
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
     * J+2 from "now") and re-send the email.
     *
     * ## Recevable sur `sent` ET sur `expired` (TCK-368)
     *
     * Une invitation périmée devait auparavant être RÉ-ÉMISE depuis
     * « Inviter » : `send()` ne voyant aucune ligne `sent`, il en créait une
     * SECONDE, et le destinataire se retrouvait avec deux lignes pour une
     * seule invitation (mesuré : `POST /api/invitations` → 201, deux lignes
     * pour le même courriel). La relance ressuscite donc la ligne existante
     * plutôt que d'en laisser naître une voisine — même décision que
     * `SuperAdminCooptationService::resendInvitation()`,
     * désormais prise ICI pour que les deux surfaces en héritent.
     *
     * La résurrection est la SEULE branche qui augmente le nombre de lignes
     * `sent` d'un destinataire : elle est gardée par
     * {@see self::assertSlotIsFree()} (409 nommant la ligne survivante)
     * plutôt que de ressusciter à côté d'une vivante.
     *
     * ## Bascule, courriel et journal sont dans UNE transaction
     *
     * Le jeton était réécrit dans une transaction qui COMMITAIT, PUIS le
     * courriel partait, PUIS le journal s'écrivait. Mesuré avec un envoi en
     * échec : jeton tourné, statut `sent`, ZÉRO entrée d'audit — l'ancien
     * lien du destinataire mort, aucun nouveau parti, et l'écran affichant
     * une invitation « en attente » que personne n'a reçue. Le compromis
     * inverse (commit en échec après un envoi réussi) donne un jeton absent
     * de la base : le destinataire le voit en 404 et l'inviteur le corrige
     * en relançant. *Le premier défaut est silencieux, le second se voit* —
     * c'est ce qui départage (TCK-367, reconduit ici).
     */
    public function resend(Invitation $invitation, User $actor): Invitation
    {
        if (! in_array($invitation->status, [InvitationStatus::Sent, InvitationStatus::Expired], true)) {
            throw ValidationException::withMessages([
                'status' => [__('invitations.errors.cannot_resend')],
            ])->status(422);
        }

        return DB::transaction(function () use ($invitation, $actor): Invitation {
            // Relire SOUS le verrou : le modèle vient du route-model binding,
            // donc d'avant la transaction. `lockForUpdate()` sur la ligne
            // elle-même ferme la course avec les écrivains qui ne passent pas
            // par ici (le cron `invitations:expire`, la révocation).
            /** @var Invitation $fraiche */
            $fraiche = Invitation::query()
                ->whereKey($invitation->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            if ($fraiche->status === InvitationStatus::Expired) {
                $this->assertSlotIsFree($fraiche);
            } elseif ($fraiche->status !== InvitationStatus::Sent) {
                // La ligne a changé d'état entre le binding et le verrou.
                throw ValidationException::withMessages([
                    'status' => [__('invitations.errors.cannot_resend')],
                ])->status(422);
            }

            $fraiche->forceFill([
                'status' => InvitationStatus::Sent->value,
                'token' => $this->generateUniqueToken(),
                'expires_at' => now()->addDays(self::DEFAULT_TTL_DAYS),
                'last_reminded_at' => null,
            ])->save();

            $existingUser = User::query()->where('email', $fraiche->email)->first();
            Mail::to($fraiche->email)
                ->locale($this->preferredLocale($existingUser, $fraiche))
                ->send(new InvitationMailable($fraiche));

            activity('Invitation')
                ->performedOn($fraiche)
                ->causedBy($actor)
                ->event('invitation_resent')
                ->log('invitation_resent');

            return $fraiche;
        });
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

            // TCK-272 — n'estampiller que la branche où l'invité a CHOISI
            // son mot de passe. Sur la branche `Str::random(40)`, le champ
            // reste NULL : ces comptes ne pouvaient pas supprimer leur
            // compte (« Mot de passe incorrect. » quoi qu'ils tapent) et
            // passent désormais par le code e-mail.
            if (isset($payload['password'])) {
                $user->markPasswordAsSet();
            }

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
        // TCK-264 — super_admin cooptation: the spatie role is NOT
        // attached at acceptance time. The user must first enroll a
        // TOTP factor through the dedicated onboarding flow; only the
        // /api/auth/super-admin/2fa/confirm endpoint flips the role on.
        // We set `force_2fa_at_first_login = true` (re-uses the TCK-263
        // column) so the dashboard / router can detect the pending state
        // and gate every super-admin surface until the factor is
        // confirmed.
        if ($invitation->role === 'super_admin') {
            $user->forceFill([
                'force_2fa_at_first_login' => true,
                'email_verified_at' => $user->email_verified_at ?? now(),
            ])->save();

            activity('Invitation')
                ->performedOn($invitation)
                ->causedBy($user)
                ->withProperties([
                    'invitation_id' => $invitation->id,
                    'user_id' => $user->id,
                ])
                ->event('super_admin_role_pending')
                ->log('super_admin_role_pending');
        } else {
            // TCK-278 — Le rôle est matérialisé par le profil polymorphe
            // (cf. Règle 5). Le flip de profil ci-dessous (statut Draft →
            // Active sur l'invitable_type ciblé) suffit pour rendre le
            // user opérationnel ; plus de double-écriture spatie.
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
            // TCK-259 — agent drafts (created sans User by
            // AgentInvitationService) get the freshly-known User attached
            // here so the post-acceptance wizard can write to
            // /api/me/profiles/{agent_profile}/* with a clean ownership
            // check (mirror Owner / SP).
            if (in_array($invitation->role, ['service_provider', 'owner', 'agent', 'agent_senior', 'agent_manager'], true)
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
     * TCK-368 — la ligne `sent` qui occupe le créneau de dédup.
     *
     * Le couple est celui de `send()` : (email, invitable_type, agency_id).
     * `Builder::where($col, null)` se traduit en `IS NULL` — les créneaux
     * sans profil cible ni agence (cooptation) sont donc comparés
     * correctement, ce qu'un `= NULL` littéral n'aurait jamais fait.
     */
    protected function liveSlotOccupant(
        string $email,
        ?string $invitableType,
        int|string|null $agencyId,
        ?int $exceptId = null,
    ): ?Invitation {
        $query = Invitation::query()
            ->where('email', CaseInsensitive::fold($email))
            ->where('status', InvitationStatus::Sent->value)
            ->where('invitable_type', $invitableType)
            ->where('agency_id', $agencyId);

        if ($exceptId !== null) {
            $query->whereKeyNot($exceptId);
        }

        return $query->first();
    }

    /**
     * TCK-368 — refuse de ressusciter une invitation SUPPLANTÉE.
     *
     * Appelée seulement sur la branche `expired → sent` de {@see self::resend()},
     * la seule qui augmente le nombre de lignes `sent` d'un destinataire.
     * Relancer une ligne déjà `sent` n'en crée aucune, même périmée : le
     * compte reste à un.
     *
     * Refuser vaut mieux que réutiliser silencieusement la ligne vivante :
     * l'opérateur a cliqué sur une ligne précise, et un 409 qui NOMME la
     * survivante lui dit laquelle relancer.
     *
     * ⚠ La garde ferme la séquence (l'opérateur ré-invite, puis relance la
     * vieille ligne), PAS la course : `send()` fait un INSERT, et aucun
     * verrou de ligne ne bloque un INSERT. La surface de cooptation ajoute
     * pour cela un verrou consultatif porté par l'e-mail
     * (`SuperAdminCooptationService::lockCooptationSlot()`) ; le généraliser
     * ici demande de le retirer de là-bas — un seul point de sérialisation,
     * pas deux — ce qui déborde de TCK-368. Ce reste est celui que `send()`
     * portait déjà avant ce ticket.
     *
     * @throws HttpException 409
     */
    protected function assertSlotIsFree(Invitation $invitation): void
    {
        $vivante = $this->liveSlotOccupant(
            (string) $invitation->email,
            $invitation->invitable_type,
            $invitation->agency_id,
            (int) $invitation->getKey(),
        );

        if ($vivante !== null) {
            throw new HttpException(
                409,
                __('invitations.errors.duplicate_pending', ['id' => $vivante->id]),
            );
        }
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
