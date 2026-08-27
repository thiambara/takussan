<?php

namespace App\Services\Auth;

use App\Models\Enums\InvitationStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\SuperAdminInvitedBroadcast;
use App\Services\Invitation\InvitationService;
use App\Support\CaseInsensitive;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * TCK-264 — Peer-to-peer super-admin cooptation.
 *
 * One existing super-admin can invite another. The invitation is just a
 * standard {@see InvitationService} row scoped to `role = super_admin` /
 * `agency_id = null`, with a `requires_2fa` metadata flag so the post-
 * acceptance flow knows to detour through the mandatory TOTP enrollment
 * page before the `PlatformProfile` is actually granted (TCK-278 — it used
 * to read « before the spatie role is attached »; `spatie/laravel-permission`
 * is uninstalled, ADR-0002).
 *
 * Mirrors the per-role specialised invitation services (Owner / Agent /
 * Service Provider): the generic InvitationService stays role-agnostic,
 * the cooptation-specific guards (caller is super_admin, target isn't
 * already one) and the broadcast notification fan-out live here.
 */
class SuperAdminCooptationService
{
    public function __construct(private readonly InvitationService $invitations) {}

    /**
     * Send a super-admin invitation.
     *
     * @param  array{email:string, first_name:string, last_name:string}  $data
     *
     * @throws AuthorizationException if the inviter is not a super_admin
     * @throws HttpException 409 if the target already holds super_admin
     */
    public function invite(User $inviter, array $data): Invitation
    {
        $this->assertInviterIsSuperAdmin($inviter);

        $email = CaseInsensitive::fold(trim((string) $data['email']));
        $this->assertTargetIsNotAlreadySuperAdmin($email);

        $invitation = DB::transaction(function () use ($inviter, $data, $email): Invitation {
            $invitation = $this->invitations->send([
                'email' => $email,
                'role' => 'super_admin',
                'invitable_type' => null,
                'invitable_id' => null,
                'agency_id' => null,
                'metadata' => [
                    'requires_2fa' => true,
                    'first_name' => trim((string) ($data['first_name'] ?? '')),
                    'last_name' => trim((string) ($data['last_name'] ?? '')),
                ],
            ], $inviter);

            activity('Invitation')
                ->performedOn($invitation)
                ->causedBy($inviter)
                ->withProperties([
                    'inviter_id' => $inviter->id,
                    'target_email' => $email,
                    'first_name' => trim((string) ($data['first_name'] ?? '')),
                    'last_name' => trim((string) ($data['last_name'] ?? '')),
                ])
                ->event('super_admin_invited')
                ->log('super_admin_invited');

            return $invitation;
        });

        $this->broadcastInvitedToOtherSuperAdmins($invitation, $inviter);

        return $invitation;
    }

    /**
     * TCK-367 — relance d'une invitation de cooptation.
     *
     * Réémet le lien de l'invitation EXISTANTE (nouveau token, `expires_at`
     * repoussé de {@see InvitationService::DEFAULT_TTL_DAYS}) : aucune
     * seconde ligne n'est créée, ce que le garde-fou de dédup de
     * `InvitationService::send()` rendrait de toute façon impossible sans
     * un 409.
     *
     * Le cas `expired` est traité ICI et pas dans le service générique :
     * une invitation de cooptation morte doit pouvoir repartir sans
     * réinvitation manuelle (sinon l'inviteur passe par `invite()`, qui
     * crée bien une SECONDE ligne — exactement ce que la contrainte du
     * ticket interdit). On la ramène en `sent` avant de déléguer, dans la
     * même transaction que la relance.
     *
     * @throws AuthorizationException if the actor is not a super_admin
     * @throws HttpException 404 if the invitation is not a cooptation one
     */
    public function resendInvitation(User $actor, Invitation $invitation): Invitation
    {
        $this->assertInviterIsSuperAdmin($actor);
        $this->assertIsCooptationInvitation($invitation);

        if ($invitation->status === InvitationStatus::Expired) {
            $invitation->forceFill(['status' => InvitationStatus::Sent->value])->save();
        }

        $invitation = $this->invitations->resend($invitation, $actor);

        activity('Invitation')
            ->performedOn($invitation)
            ->causedBy($actor)
            ->withProperties([
                'actor_id' => $actor->id,
                'target_email' => $invitation->email,
                'expires_at' => $invitation->expires_at?->toIso8601String(),
            ])
            ->event('super_admin_invitation_resent')
            ->log('super_admin_invitation_resent');

        return $invitation;
    }

    /**
     * TCK-367 — annulation d'une invitation de cooptation.
     *
     * Ne peut pas verrouiller la plateforme : seule une invitation NON
     * acceptée est annulable, donc l'ensemble des super-admins ACTIFS est
     * invariant par cette opération. (La révocation d'un actif est
     * explicitement hors périmètre du ticket.)
     *
     * @throws AuthorizationException if the actor is not a super_admin
     * @throws HttpException 404 if the invitation is not a cooptation one
     */
    public function revokeInvitation(User $actor, Invitation $invitation): Invitation
    {
        $this->assertInviterIsSuperAdmin($actor);
        $this->assertIsCooptationInvitation($invitation);

        $invitation = $this->invitations->revoke($invitation, $actor);

        activity('Invitation')
            ->performedOn($invitation)
            ->causedBy($actor)
            ->withProperties([
                'actor_id' => $actor->id,
                'target_email' => $invitation->email,
            ])
            ->event('super_admin_invitation_revoked')
            ->log('super_admin_invitation_revoked');

        return $invitation;
    }

    /**
     * La surface de cooptation n'agit QUE sur ses propres invitations.
     *
     * Un 404 plutôt qu'un 403 : une invitation d'agence n'a rien à faire
     * sous `/api/admin/super-admins/*`, et lui répondre « interdit »
     * confirmerait son existence. Les invitations d'agence se relancent
     * par les routes génériques `/api/invitations/{id}/*`.
     */
    protected function assertIsCooptationInvitation(Invitation $invitation): void
    {
        if ($invitation->role !== 'super_admin' || $invitation->agency_id !== null) {
            throw new HttpException(404, __('super_admins.cooptation.errors.invitation_not_found'));
        }
    }

    /**
     * Throws 403 if the caller isn't a super_admin.
     */
    protected function assertInviterIsSuperAdmin(User $inviter): void
    {
        if (! method_exists($inviter, 'isSuperAdmin') || ! $inviter->isSuperAdmin()) {
            throw new AuthorizationException(
                __('super_admins.cooptation.errors.not_super_admin'),
            );
        }
    }

    /**
     * Throws 409 if the target email already maps to a User holding the
     * `super_admin` role globally. A user that is *invited but not yet
     * confirmed* is fine — they'll accept under the same flow.
     */
    protected function assertTargetIsNotAlreadySuperAdmin(string $email): void
    {
        $existing = User::query()->where('email', $email)->first();
        if ($existing === null) {
            return;
        }

        if ($existing->isSuperAdmin()) {
            throw new HttpException(
                409,
                __('super_admins.cooptation.errors.already_super_admin', ['email' => $email]),
            );
        }
    }

    /**
     * Notify every other super-admin about the invitation. The inviter is
     * deliberately excluded — they already know they fired the action and
     * a self-notification would just be noise.
     */
    protected function broadcastInvitedToOtherSuperAdmins(Invitation $invitation, User $inviter): void
    {
        $recipients = $this->otherSuperAdmins($inviter);
        if ($recipients->isEmpty()) {
            return;
        }

        Notification::send($recipients, new SuperAdminInvitedBroadcast($invitation, $inviter));
    }

    /**
     * Resolve every super_admin user except `$exclude`.
     *
     * @return Collection<int, User>
     */
    public function otherSuperAdmins(?User $exclude = null): Collection
    {
        return $this->superAdmins()->reject(
            fn (User $user) => $exclude !== null && (int) $user->id === (int) $exclude->id,
        )->values();
    }

    /**
     * TCK-278 — Source de vérité unifiée : `PlatformProfile` actif niveau
     * super_admin. Plus de probe spatie team_id=null.
     *
     * @return Collection<int, User>
     */
    public function superAdmins(): Collection
    {
        return User::query()
            ->whereHas('platformProfile', fn ($q) => $q
                ->whereNull('revoked_at')
                ->where('level', PlatformProfileLevel::SuperAdmin->value))
            ->get();
    }
}
