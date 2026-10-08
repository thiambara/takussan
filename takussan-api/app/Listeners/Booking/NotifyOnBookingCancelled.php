<?php

namespace App\Listeners\Booking;

use App\Domain\Notifications\NotificationCode;
use App\Events\Booking\BookingClosed;
use App\Services\Booking\BookingNotificationParams;
use App\Services\Booking\BookingStakeholders;
use App\Services\Model\NotificationService;

/**
 * TCK-596 — une annulation prévient toutes les parties prenantes, moins son auteur : le client
 * qui annule prévient le bailleur et l'agent du bien, l'agent qui annule prévient le client et le
 * bailleur.
 *
 * Seulement pour `cancelled` : le refus prévient déjà le client (`BookingService::reject`), et
 * l'expiration passe par `BookingExpiredNotification`.
 */
class NotifyOnBookingCancelled
{
    public function __construct(
        private readonly BookingStakeholders $stakeholders,
        private readonly NotificationService $notifications,
    ) {}

    public function handle(BookingClosed $event): void
    {
        if ($event->reason !== BookingClosed::REASON_CANCELLED) {
            return;
        }

        $booking = $event->booking;
        $code = NotificationCode::BookingCancelled;

        foreach ($this->stakeholders->for($booking) as $user) {
            if ($user->id === $event->authorId) {
                continue;
            }
            $this->notifications->send($user, $code, BookingNotificationParams::for($booking, $code), BookingNotificationParams::target($booking));
        }
    }
}
