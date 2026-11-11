<?php

namespace App\Services\Invitation;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Invitation;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Policies\InvitationPolicy;
use App\Rules\PersonnelDeLAgence;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Model\NotificationService;
use App\Support\LienFront;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/**
 * TCK-2609 (ADR-0094 §3) — l'invité dont le lien a expiré demande un nouveau lien : l'invitant en
 * est prévenu (cloche + e-mail), avec le lien vers la page où il renvoie l'invitation
 * (`POST /api/invitations/{invitation}/resend`).
 *
 * Une demande par invitation et par 24 h : la suivante ne prévient personne. La borne vit sur
 * l'invitation (`metadata.renewal_requested_at`), posée sous verrou de sa ligne — deux demandes
 * simultanées n'écrivent qu'un avis.
 *
 * TCK-2726 (décision du porteur du 2026-11-11) — l'avis va à qui peut ENCORE renvoyer l'invitation
 * ({@see self::recipients()}), jamais à un ancien membre parti avec le contact de l'invité. La borne
 * n'est consommée que si quelqu'un est prévenu : sans destinataire, rien n'est écrit, et une demande
 * suivante (l'admin réactivé) prévient. La réponse HTTP n'en dit rien (202 dans tous les cas).
 */
class InvitationRenewalRequests
{
    public const WINDOW_HOURS = 24;

    public function __construct(private readonly NotificationService $notifications) {}

    /** Vrai si quelqu'un a été prévenu ; faux sinon (demande de moins de 24 h, ou personne pour renvoyer). */
    public function request(Invitation $invitation): bool
    {
        /** @var Collection<int, User> $recipients */
        $recipients = DB::transaction(function () use ($invitation): Collection {
            /** @var Invitation $locked */
            $locked = Invitation::query()->whereKey($invitation->getKey())->lockForUpdate()->firstOrFail();
            $last = data_get($locked->metadata, 'renewal_requested_at');

            // La borne d'abord : une demande répétée sur cette route publique ne paie pas la résolution.
            if (is_string($last) && Carbon::parse($last)->gt(now()->subHours(self::WINDOW_HOURS))) {
                return collect();
            }

            $recipients = $this->recipients($locked);
            if ($recipients->isEmpty()) {
                return $recipients;
            }

            $locked->metadata = [...($locked->metadata ?? []), 'renewal_requested_at' => now()->toIso8601String()];
            $locked->save();

            return $recipients;
        });

        if ($recipients->isEmpty()) {
            return false;
        }

        $target = self::target($invitation);
        foreach ($recipients as $recipient) {
            $this->notifications->send(
                $recipient,
                NotificationCode::InvitationRenewalRequested,
                [
                    'invitee' => (string) $invitation->inviteeContact(),
                    'role' => $invitation->role,
                    'url' => LienFront::vers($target?->path() ?? '/app'),
                ],
                $target,
                data: ['invitation_id' => $invitation->id],
            );
        }

        return true;
    }

    /**
     * TCK-2726 — qui peut encore renvoyer l'invitation : la règle de {@see InvitationPolicy::resend()}
     * (l'admin principal, ou `team.invite` dans l'agence ; sans agence, l'invitant lui-même), doublée,
     * pour une invitation d'agence, du contrôle de personnel actif
     * ({@see PersonnelDeLAgence::estPersonnel()}, le prédicat d'un TIERS : l'invitant n'est pas
     * l'appelant de cette route publique, `personnelActifDe` lirait le profil actif de la requête).
     * L'admin principal se juge par identifiant dans la policy : c'est ce contrôle qui écarte celui
     * dont le profil est suspendu.
     *
     * L'invitant s'il passe ; sinon le personnel actif de l'agence qui passe.
     *
     * @return Collection<int, User>
     */
    private function recipients(Invitation $invitation): Collection
    {
        $inviter = $invitation->inviter;
        $agencyId = $invitation->agency_id === null ? null : (int) $invitation->agency_id;
        $peutRenvoyer = fn (User $user): bool => ($agencyId === null || PersonnelDeLAgence::estPersonnel($user, $agencyId))
            && Gate::forUser($user)->allows('resend', $invitation);

        if ($inviter !== null && $peutRenvoyer($inviter)) {
            return collect([$inviter]);
        }
        if ($agencyId === null) {
            return collect();
        }

        $staff = User::query()
            ->whereIn('id', AgentProfile::query()->active()->where('agency_id', $agencyId)->select('user_id')
                ->union(AgencyAdminProfile::query()->active()->where('agency_id', $agencyId)->select('user_id'))
                ->union(RoleDelegation::query()->where('agency_id', $agencyId)
                    ->whereIn('role', [AgencyRoleBaseType::Agent->value, AgencyRoleBaseType::AgencyAdmin->value])
                    ->enVigueur()->select('user_id')))
            ->whereKeyNot($inviter?->getKey() ?? 0)
            ->orderBy('id')
            ->get();

        return MembershipCapabilityResolver::primed(
            $staff->modelKeys(),
            [$agencyId],
            fn (): Collection => $staff->filter($peutRenvoyer)->values(),
        );
    }

    /** La page où l'invitant retrouve l'invitation et la renvoie : l'équipe, les bailleurs, les prestataires. */
    private static function target(Invitation $invitation): ?NotificationTarget
    {
        $kind = match ($invitation->role) {
            'agent', 'agency_admin' => 'team',
            'owner' => 'owners',
            'service_provider' => 'service_providers',
            default => null,
        };

        return $kind === null ? null : NotificationTarget::of($kind)->forAgency($invitation->agency_id);
    }
}
