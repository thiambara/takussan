<?php

namespace App\Services\Booking;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Booking;

/**
 * TCK-596 — les paramètres d'une notification de réservation, en un endroit : `BookingService`
 * et les écouteurs de `BookingRequested` / `BookingClosed` envoyaient sinon chacun les leurs.
 */
final class BookingNotificationParams
{
    /** @return array<string, mixed> */
    public static function for(Booking $booking, NotificationCode $code): array
    {
        $booking->loadMissing('property');

        $all = [
            'reference' => $booking->reference_number ?? (string) $booking->id,
            'property' => $booking->property?->title,
            'start_date' => $booking->start_date?->toDateString(),
            'end_date' => $booking->end_date?->toDateString(),
        ];

        return array_intersect_key($all, $code->params());
    }

    public static function target(Booking $booking): NotificationTarget
    {
        return NotificationTarget::of('booking', $booking->id);
    }
}
