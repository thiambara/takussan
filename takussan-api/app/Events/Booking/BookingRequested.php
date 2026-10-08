<?php

namespace App\Events\Booking;

use App\Models\Booking;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-596 — une demande de réservation vient d'être créée : privée (`BookingService::create`),
 * publique ou offre d'achat (`PublicPropertyController::bookingRequest`). Une seule source pour
 * prévenir qui doit la traiter, quelle que soit la porte d'entrée.
 */
class BookingRequested implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    public function __construct(public Booking $booking, public ?int $authorId = null) {}
}
