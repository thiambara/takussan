<?php

namespace App\Services\Invitation;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Invitation;
use App\Services\Model\NotificationService;
use App\Support\LienFront;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2609 (ADR-0094 §3) — l'invité dont le lien a expiré demande un nouveau lien : l'invitant en
 * est prévenu (cloche + e-mail), avec le lien vers la page où il renvoie l'invitation
 * (`POST /api/invitations/{invitation}/resend`).
 *
 * Une demande par invitation et par 24 h : la suivante ne prévient personne. La borne vit sur
 * l'invitation (`metadata.renewal_requested_at`), posée sous verrou de sa ligne — deux demandes
 * simultanées n'écrivent qu'un avis.
 */
class InvitationRenewalRequests
{
    public const WINDOW_HOURS = 24;

    public function __construct(private readonly NotificationService $notifications) {}

    /** Vrai si l'invitant a été prévenu, faux si une demande de moins de 24 h l'avait déjà fait. */
    public function request(Invitation $invitation): bool
    {
        $accepted = DB::transaction(function () use ($invitation): bool {
            /** @var Invitation $locked */
            $locked = Invitation::query()->whereKey($invitation->getKey())->lockForUpdate()->firstOrFail();
            $last = data_get($locked->metadata, 'renewal_requested_at');

            if (is_string($last) && Carbon::parse($last)->gt(now()->subHours(self::WINDOW_HOURS))) {
                return false;
            }

            $locked->metadata = [...($locked->metadata ?? []), 'renewal_requested_at' => now()->toIso8601String()];
            $locked->save();

            return true;
        });

        $inviter = $invitation->inviter;
        if (! $accepted || $inviter === null) {
            return false;
        }

        $target = self::target($invitation);
        $this->notifications->send(
            $inviter,
            NotificationCode::InvitationRenewalRequested,
            [
                'invitee' => (string) $invitation->inviteeContact(),
                'role' => $invitation->role,
                'url' => LienFront::vers($target?->path() ?? '/app'),
            ],
            $target,
            data: ['invitation_id' => $invitation->id],
        );

        return true;
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
