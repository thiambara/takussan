<?php

namespace App\Listeners\Lease;

use App\Events\Lease\LeasePaymentLateFeeApplied;
use App\Notifications\LeasePaymentLateFeeNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;

/**
 * TCK-087 — Notifies the tenant (via their linked User) when a late fee
 * has just been applied. Channel selection is delegated to the
 * Notification class which calls into PreferenceResolver.
 */
class NotifyTenantOfLateFee implements ShouldQueue
{
    public function handle(LeasePaymentLateFeeApplied $event): void
    {
        $payment = $event->payment->loadMissing('lease.tenant.user');
        $tenantUser = $payment->lease?->tenant?->user;

        if ($tenantUser === null) {
            return;
        }

        Notification::send(
            $tenantUser,
            new LeasePaymentLateFeeNotification($payment, $event->amount, $event->percent, $event->base),
        );
    }
}
