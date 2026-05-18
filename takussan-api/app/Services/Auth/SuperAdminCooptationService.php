<?php

namespace App\Services\Auth;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\SuperAdminInvitedBroadcast;
use App\Services\Invitation\InvitationService;
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
 * page before the spatie role is actually attached.
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

        $email = strtolower(trim((string) $data['email']));
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
