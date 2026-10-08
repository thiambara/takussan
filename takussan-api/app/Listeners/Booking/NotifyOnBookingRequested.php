<?php

namespace App\Listeners\Booking;

use App\Domain\Notifications\NotificationCode;
use App\Events\Booking\BookingRequested;
use App\Services\Booking\BookingNotificationParams;
use App\Services\Booking\BookingStakeholders;
use App\Services\Model\NotificationService;

/**
 * TCK-596 — une demande prévient qui doit la traiter : bailleur, auteur s'il est du personnel,
 * collaborateurs acceptés `manager|agent` du bien. Jamais le client ni l'auteur de la demande :
 * on ne s'annonce pas son propre geste.
 */
class NotifyOnBookingRequested
{
    public function __construct(
        private readonly BookingStakeholders $stakeholders,
        private readonly NotificationService $notifications,
    ) {}

    public function handle(BookingRequested $event): void
    {
        $booking = $event->booking;
        $booking->loadMissing(['customer', 'property']);

        $excluded = array_filter([$booking->customer?->user_id, $event->authorId]);
        $code = $booking->start_date !== null && $booking->end_date !== null
            ? NotificationCode::BookingCreated
            : NotificationCode::BookingRequestedUndated;

        foreach ($this->stakeholders->for($booking) as $user) {
            if (in_array($user->id, $excluded, true)) {
                continue;
            }
            $this->notifications->send($user, $code, BookingNotificationParams::for($booking, $code), BookingNotificationParams::target($booking));
        }
    }
}
