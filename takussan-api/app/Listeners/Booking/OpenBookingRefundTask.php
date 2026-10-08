<?php

namespace App\Listeners\Booking;

use App\Events\Booking\BookingClosed;
use App\Services\Booking\BookingRefundTaskService;

/**
 * TCK-596 — une réservation fermée qui porte un acompte `paid` ouvre une tâche « remboursement à
 * traiter », quel que soit le chemin qui l'a fermée (annulation, refus, les trois expirations).
 * Le service sort sans rien faire s'il n'y a rien à rembourser, et n'ouvre jamais deux tâches.
 */
class OpenBookingRefundTask
{
    public function __construct(private readonly BookingRefundTaskService $tasks) {}

    public function handle(BookingClosed $event): void
    {
        $this->tasks->openFor($event->booking, $event->authorId);
    }
}
