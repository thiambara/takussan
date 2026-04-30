<?php

namespace App\Listeners\Lease;

use App\Events\Lease\LeaseRentReviewed;
use App\Notifications\LeaseRentReviewedNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;

/**
 * TCK-091 — Notify the tenant when the rent on their lease is reviewed.
 * Only the tenant-side User receives the push; agency-side actors already
 * see the action via the activity timeline.
 */
class NotifyTenantOfRentReview implements ShouldQueue
{
    public function handle(LeaseRentReviewed $event): void
    {
        $lease = $event->lease;
        $lease->loadMissing('tenant.user');

        $tenantUser = $lease->tenant?->user;
        if ($tenantUser === null) {
            return;
        }

        Notification::send(
            $tenantUser,
            new LeaseRentReviewedNotification(
                $lease,
                $event->oldRent,
                $event->newRent,
                $event->reason,
                $event->effectiveDate,
            ),
        );
    }
}
