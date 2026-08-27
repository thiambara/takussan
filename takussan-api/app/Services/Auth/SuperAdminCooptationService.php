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
            // Le garde-fou de dédup de `send()` est un « lire puis insérer »
            // sans verrou : deux invitations simultanées pour le même
            // destinataire ne se voient pas. Toutes les écritures de CETTE
            // surface prennent d'abord le même verrou consultatif, ce qui
            // les sérialise — cf. {@see self::lockCooptationSlot()}.
            $this->lockCooptationSlot($email);

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
     * seconde ligne n'est créée.
     *
     * Le cas `expired` est traité ICI et pas dans le service générique :
     * une invitation de cooptation morte doit pouvoir repartir sans
     * réinvitation manuelle (sinon l'inviteur passe par `invite()`, qui
     * crée bien une SECONDE ligne — exactement ce que la contrainte du
     * ticket interdit).
     *
     * ⚠ Cette résurrection contourne le garde-fou de dédup de
     * `InvitationService::send()`, qui ne regarde QUE les lignes `sent`.
     * Séquence mesurée : une cooptation expire, la ligne RESTE à l'écran
     * (c'est le but du ticket), l'inviteur réinvite depuis « Inviter » —
     * `send()` ne voit aucune ligne `sent` et en crée une seconde —, puis
     * quelqu'un relance la vieille : deux lignes `sent`, deux jetons
     * ouvrants pour un seul destinataire. L'INVARIANT tenu ici est donc
     * « au plus UNE ligne `sent` par destinataire coopté », gardé de
     * l'autre côté par `send()` : on refuse la relance d'une ligne
     * SUPPLANTÉE ({@see self::assertNotSupplanted()}) plutôt que de la
     * ressusciter à côté de la vivante. Refuser vaut mieux que réutiliser
     * silencieusement la ligne vivante : l'opérateur a cliqué sur une
     * ligne précise, et un 409 qui NOMME la ligne survivante lui dit
     * laquelle relancer.
     *
     * ⚠ Bascule, relance et journal sont dans UNE transaction, et le
     * courriel de `InvitationService::resend()` part DEDANS — comme celui
     * de `send()` part déjà dans la transaction de `invite()` ci-dessus.
     * Le docblock l'affirmait sans qu'aucun `DB::transaction()` n'existe :
     * mesuré, un envoi SMTP en échec laissait l'invitation `sent` avec un
     * NOUVEAU jeton et sept jours de plus sans qu'aucun courriel ne parte
     * — ancien lien du destinataire mort, nouveau jamais envoyé, écran
     * affichant une invitation « en attente » que personne n'a reçue. Le
     * compromis inverse (commit en échec après un envoi réussi) donne un
     * jeton absent de la base : le destinataire le voit en 404 et
     * l'inviteur le corrige en relançant. Le premier défaut est
     * silencieux, le second se voit — c'est ce qui départage.
     *
     * @throws AuthorizationException if the actor is not a super_admin
     * @throws HttpException 404 if the invitation is not a cooptation one
     * @throws HttpException 409 if a live invitation already supersedes it
     */
    public function resendInvitation(User $actor, Invitation $invitation): Invitation
    {
        $this->assertInviterIsSuperAdmin($actor);
        $this->assertIsCooptationInvitation($invitation);

        return DB::transaction(function () use ($actor, $invitation): Invitation {
            $this->lockCooptationSlot((string) $invitation->email);

            // Relire SOUS le verrou : le modèle vient du route-model
            // binding, donc d'avant la transaction. `lockForUpdate()` sur
            // la ligne elle-même ferme la course avec les écrivains qui ne
            // passent PAS par cette surface (le cron `invitations:expire`,
            // la révocation générique `/api/invitations/{id}/revoke`).
            /** @var Invitation $invitation */
            $invitation = Invitation::query()
                ->whereKey($invitation->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            if ($invitation->status === InvitationStatus::Expired) {
                $this->assertNotSupplanted($invitation);
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
        });
    }

    /**
     * TCK-367 — annulation d'une invitation de cooptation.
     *
     * Ne peut pas verrouiller la plateforme : seule une invitation NON
     * acceptée est annulable, donc l'ensemble des super-admins ACTIFS est
     * invariant par cette opération. (La révocation d'un actif est
     * explicitement hors périmètre du ticket.)
     *
     * ⚠ `InvitationService::revoke()` est IDEMPOTENT : sur une ligne déjà
     * `revoked` il sort sans rien écrire. Journaliser quand même faisait
     * compter les no-op comme des actions — mesuré, deux POST /revoke sur
     * la même invitation écrivaient DEUX lignes
     * `super_admin_invitation_revoked` pour une seule annulation réelle,
     * et un double-clic devenait deux annulations dans la console
     * d'audit. Sur la surface la plus privilégiée de la plateforme, un
     * journal qui raconte une histoire fausse est un défaut : on ne
     * journalise que la TRANSITION.
     *
     * @throws AuthorizationException if the actor is not a super_admin
     * @throws HttpException 404 if the invitation is not a cooptation one
     */
    public function revokeInvitation(User $actor, Invitation $invitation): Invitation
    {
        $this->assertInviterIsSuperAdmin($actor);
        $this->assertIsCooptationInvitation($invitation);

        $etaitDejaRevoquee = $invitation->status === InvitationStatus::Revoked;

        $invitation = $this->invitations->revoke($invitation, $actor);

        if ($etaitDejaRevoquee) {
            return $invitation;
        }

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
     * Refuse la relance d'une ligne SUPPLANTÉE.
     *
     * Appelée seulement sur la branche de résurrection `expired → sent` :
     * c'est la SEULE qui augmente le nombre de lignes `sent` pour un
     * destinataire. Relancer une ligne déjà `sent` n'en crée aucune, même
     * si son `expires_at` est dépassé — le compte reste à un.
     *
     * Le critère est le statut `sent`, PAS « vivante » (`sent` et
     * `expires_at` future). Compter comme libre le créneau d'une ligne
     * `sent` déjà périmée que le cron horaire n'a pas encore marquée
     * rouvrirait exactement le trou : cette ligne-là, elle, se relance
     * sans passer par ici.
     *
     * Le couple gardé est celui de la dédup de `InvitationService::send()`
     * — (email, invitable_type, agency_id) — restreint au rôle
     * `super_admin`, c'est-à-dire au créneau que `assertIsCooptationInvitation()`
     * définit.
     *
     * @throws HttpException 409
     */
    protected function assertNotSupplanted(Invitation $invitation): void
    {
        $vivante = Invitation::query()
            ->whereRaw(
                CaseInsensitive::sql('email').' = ?',
                [CaseInsensitive::fold((string) $invitation->email)],
            )
            ->where('role', 'super_admin')
            ->whereNull('agency_id')
            ->whereNull('invitable_type')
            ->where('status', InvitationStatus::Sent->value)
            ->whereKeyNot($invitation->getKey())
            ->first();

        if ($vivante !== null) {
            throw new HttpException(
                409,
                __('invitations.errors.duplicate_pending', ['id' => $vivante->id]),
            );
        }
    }

    /**
     * Le point de sérialisation de la surface de cooptation, pour un
     * destinataire donné.
     *
     * Il n'y a PAS de ligne parent à verrouiller : une invitation de
     * cooptation a `agency_id = null` et `invitable_type = null` par
     * définition. Et verrouiller les lignes existantes ne fermerait rien
     * ici — la course qui compte est un INSERT concurrent (`send()`) face
     * à une résurrection (`resendInvitation()`), et aucun verrou de ligne
     * ne bloque un INSERT. Un verrou consultatif porté par l'e-mail est
     * le seul point commun aux deux chemins.
     *
     * `pg_advisory_xact_lock` se libère au COMMIT/ROLLBACK — donc aucun
     * verrou qui survivrait à une exception, et rien à libérer à la main.
     * Il est cantonné à la base courante, ce qui laisse `--parallel`
     * intact (une base par processus, cf. `Tests\Support\TestDatabase`).
     *
     * `crc32` rend un entier non signé sur 32 bits, que le `bigint` de
     * PostgreSQL accueille sans troncature.
     */
    protected function lockCooptationSlot(string $email): void
    {
        DB::selectOne('select pg_advisory_xact_lock(?)', [
            crc32('super_admin_cooptation:'.CaseInsensitive::fold($email)),
        ]);
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
