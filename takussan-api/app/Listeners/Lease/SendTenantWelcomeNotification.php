<?php

namespace App\Listeners\Lease;

use App\Events\Lease\LeaseActivated;
use App\Notifications\TenantWelcomeNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;

/**
 * TCK-265 — Sends the welcome notification (in-app + email) to the
 * tenant the first time their lease becomes active. Logs the event
 * and stamps `tenant_welcomed_at` so any subsequent activation of the
 * same lease is a no-op.
 *
 * Idempotence is enforced via the `tenant_welcomed_at` column rather
 * than the existence of a previous `AppNotification` row: the column
 * is already loaded by the listener and lets us skip a query on the
 * (much larger) notifications table on every activation.
 */
class SendTenantWelcomeNotification implements ShouldQueue
{
    public function handle(LeaseActivated $event): void
    {
        $lease = $event->lease->fresh();
        if ($lease === null) {
            return;
        }

        // Idempotence guard — `LeaseActivated` may legitimately fire
        // multiple times during ops support (lease bounced through draft
        // and re-activated), but the welcome should only land once.
        if ($lease->tenant_welcomed_at !== null) {
            return;
        }

        $lease->loadMissing('tenant.user');
        $tenantUser = $lease->tenant?->user;

        if ($tenantUser === null) {
            // No linked user account yet (rare — the lease was created
            // before the customer claimed their invite). Stamp anyway so
            // we don't try again forever; the welcome is best-effort.
            $lease->forceFill(['tenant_welcomed_at' => now()])->save();

            return;
        }

        Notification::send($tenantUser, new TenantWelcomeNotification($lease));

        activity()
            ->causedBy($tenantUser)
            ->performedOn($lease)
            ->withProperties(['lease_id' => $lease->id])
            ->log('tenant_welcomed');

        $lease->forceFill(['tenant_welcomed_at' => now()])->save();
    }
}
