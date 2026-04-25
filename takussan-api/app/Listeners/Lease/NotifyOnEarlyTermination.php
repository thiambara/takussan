<?php

namespace App\Listeners\Lease;

use App\Events\Lease\LeaseEarlyTerminationCancelled;
use App\Events\Lease\LeaseEarlyTerminationConfirmed;
use App\Events\Lease\LeaseEarlyTerminationRequested;
use App\Models\Lease;
use App\Notifications\LeaseEarlyTerminationNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;

/**
 * TCK-090 — Notifies the tenant (and the landlord, when distinct from the
 * actor) of every transition: requested → cancelled / confirmed.
 *
 * Stakeholders are derived from the lease itself (tenant.user + landlord +
 * agency members upstream); we deliberately keep the surface small here —
 * the notification class delegates channel selection to `PreferenceResolver`.
 */
class NotifyOnEarlyTermination implements ShouldQueue
{
    public function handleRequested(LeaseEarlyTerminationRequested $event): void
    {
        $this->dispatch($event->lease, LeaseEarlyTerminationNotification::TRANSITION_REQUESTED, $event->invoice);
    }

    public function handleCancelled(LeaseEarlyTerminationCancelled $event): void
    {
        $this->dispatch($event->lease, LeaseEarlyTerminationNotification::TRANSITION_CANCELLED);
    }

    public function handleConfirmed(LeaseEarlyTerminationConfirmed $event): void
    {
        $this->dispatch($event->lease, LeaseEarlyTerminationNotification::TRANSITION_CONFIRMED);
    }

    protected function dispatch(Lease $lease, string $transition, $invoice = null): void
    {
        $lease->loadMissing(['tenant.user', 'landlord']);

        $tenantUser = $lease->tenant?->user;
        $landlord = $lease->landlord;

        $recipients = collect([$tenantUser, $landlord])
            ->filter()
            ->unique('id')
            ->values();

        if ($recipients->isEmpty()) {
            return;
        }

        Notification::send(
            $recipients,
            new LeaseEarlyTerminationNotification($lease, $transition, $invoice),
        );
    }
}
