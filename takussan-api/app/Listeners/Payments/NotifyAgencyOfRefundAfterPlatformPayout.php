<?php

namespace App\Listeners\Payments;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Events\Payments\PlatformPayoutLineRefunded;
use App\Models\Agency;
use App\Models\PlatformPayout;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Model\NotificationService;

/**
 * TCK-2320 (P39.07) — les admins de l'agence apprennent qu'une ligne d'un reversement de la
 * plateforme déjà versé a été remboursée depuis : le mois du reversement et la référence de la
 * ligne, sans montant. Mêmes destinataires que le double encaissement (TCK-593).
 */
class NotifyAgencyOfRefundAfterPlatformPayout
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function handle(PlatformPayoutLineRefunded $event): void
    {
        $payout = PlatformPayout::query()->find($event->platformPayoutId);
        if ($payout === null) {
            return;
        }

        $userIds = AgencyAdminProfile::query()->active()->where('agency_id', $payout->agency_id)->pluck('user_id')
            ->push(Agency::query()->whereKey($payout->agency_id)->value('primary_admin_id'))
            ->filter()
            ->unique();

        $params = ['period' => $payout->period_end?->format('Y-m'), 'reference' => $event->reference];
        $target = NotificationTarget::of('agency_billing')->forAgency($payout->agency_id);
        foreach (User::query()->whereIn('id', $userIds)->get() as $admin) {
            $this->notifications->send($admin, NotificationCode::PlatformPayoutRefundedSincePaid, $params, $target);
        }
    }
}
