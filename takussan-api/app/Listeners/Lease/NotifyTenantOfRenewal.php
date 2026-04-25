<?php

namespace App\Listeners\Lease;

use App\Events\Lease\LeaseRenewed;
use App\Notifications\LeaseRenewedNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;

/**
 * TCK-089 — Notifies the tenant (via their linked User) when their lease
 * has just been renewed/amended. Channel selection is delegated to the
 * Notification class which calls into PreferenceResolver.
 */
class NotifyTenantOfRenewal implements ShouldQueue
{
    public function handle(LeaseRenewed $event): void
    {
        $child = $event->child->loadMissing('tenant.user');
        $tenantUser = $child->tenant?->user;

        if ($tenantUser === null) {
            return;
        }

        Notification::send(
            $tenantUser,
            new LeaseRenewedNotification($event->parent, $event->child, $event->changes),
        );
    }
}
