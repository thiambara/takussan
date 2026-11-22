<?php

namespace App\Listeners\Booking;

use App\Events\Booking\BookingRequested;
use App\Models\Booking;
use App\Services\Messaging\SallesDuFil;

/**
 * TCK-2960 (ADR-0128 § 2) — une réservation créée a sa salle : le compte du candidat et le contact
 * principal du bien. `BookingRequested` est la seule source, quelle que soit la porte d'entrée (privée,
 * publique, offre d'achat), et part après le COMMIT (`ShouldDispatchAfterCommit`).
 *
 * Découvert par `app/Listeners` (aucun `listen()` à écrire, TCK-443). Synchrone : la réponse de la
 * réservation peut déjà proposer la salle.
 */
class OpenBookingRoom
{
    public function __construct(private readonly SallesDuFil $salles) {}

    public function handle(BookingRequested $event): void
    {
        $booking = Booking::query()->find($event->booking->getKey());
        if ($booking !== null) {
            $this->salles->ouvrirApresLEcriture($booking);
        }
    }
}
