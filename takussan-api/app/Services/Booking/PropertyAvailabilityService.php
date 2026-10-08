<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Property;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * TCK-596 — un bien est-il libre sur [début, fin) ? Intervalle SEMI-OUVERT partout : la nuit du
 * départ n'est pas occupée, deux séjours bout à bout ne se chevauchent pas.
 *
 * `BookingService::assertNoOverlap` comparait en bornes fermées (`start <= fin AND end >= début`) :
 * un séjour qui arrive le jour du départ d'un autre était refusé à la confirmation. Et rien ne
 * vérifiait à la DEMANDE : une demande sur des nuits déjà confirmées était créée (201).
 *
 * ⚠ L'appelant tient le verrou de la ligne `properties` (piège PostgreSQL n° 2 : jamais
 * `lockForUpdate()` sur un agrégat) : c'est lui qui sérialise deux confirmations concurrentes.
 */
class PropertyAvailabilityService
{
    public function assertAvailable(
        Property|int $property,
        CarbonInterface|string|null $start,
        CarbonInterface|string|null $end,
        ?Booking $ignore = null,
    ): void {
        if ($start === null || $end === null) {
            return;
        }

        abort_code_if(
            $this->confirmedOverlapExists($property instanceof Property ? $property->id : $property, Carbon::parse($start), Carbon::parse($end), $ignore),
            422,
            'booking.dates_overlap'
        );
    }

    private function confirmedOverlapExists(int $propertyId, CarbonInterface $start, CarbonInterface $end, ?Booking $ignore): bool
    {
        return Booking::query()
            ->where('property_id', $propertyId)
            ->when($ignore !== null, fn ($q) => $q->whereKeyNot($ignore->getKey()))
            ->where('status', BookingStatus::Confirmed)
            ->whereNotNull('start_date')
            ->whereNotNull('end_date')
            ->where('start_date', '<', $end->toDateString())
            ->where('end_date', '>', $start->toDateString())
            ->exists();
    }
}
