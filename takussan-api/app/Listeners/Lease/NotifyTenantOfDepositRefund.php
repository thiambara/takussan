<?php

namespace App\Listeners\Lease;

use App\Events\Lease\LeaseDepositRefunded;
use App\Notifications\LeaseDepositRefundNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;

/**
 * TCK-088 — Notifies the tenant (via their linked User, if any) when their
 * deposit has just been refunded — total or partial, with retention reason
 * + media attachments forwarded by the notification class.
 */
class NotifyTenantOfDepositRefund implements ShouldQueue
{
    public function handle(LeaseDepositRefunded $event): void
    {
        $tenantUser = $event->lease->loadMissing('tenant.user')->tenant?->user;

        if ($tenantUser === null) {
            return;
        }

        Notification::send(
            $tenantUser,
            new LeaseDepositRefundNotification(
                $event->lease,
                $event->refunded,
                $event->retained,
                $event->reason,
            ),
        );
    }
}
