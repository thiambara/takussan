<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Property;
use App\Models\PropertyUnavailability;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
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

        $propertyId = $property instanceof Property ? $property->id : $property;
        $start = Carbon::parse($start);
        $end = Carbon::parse($end);

        abort_code_if(
            $this->confirmedOverlapExists($propertyId, $start, $end, $ignore),
            422,
            'booking.dates_overlap'
        );

        // TCK-596 §3B (ADR-0041) — une nuit bloquée, à la main ou par un flux importé.
        abort_code_if(
            $this->unavailabilityOverlapExists($propertyId, $start, $end),
            422,
            'booking.dates_unavailable'
        );
    }

    /**
     * La réservation confirmée qui chevauche `[start, end)`, s'il y en a une — pour refuser un
     * blocage manuel et marquer un événement importé en conflit.
     */
    public function confirmedOverlap(int $propertyId, CarbonInterface $start, CarbonInterface $end): ?Booking
    {
        return $this->confirmedOverlapQuery($propertyId, $start, $end, null)->orderBy('start_date')->first();
    }

    /**
     * TCK-596 §3B — les plages occupées de `[from, to)`, fusionnées, sans rien qui dise pourquoi :
     * réservations confirmées et indisponibilités (manuelles et importées) confondues.
     *
     * @return list<array{start: string, end: string}>
     */
    public function occupiedRanges(Property $property, CarbonInterface $from, CarbonInterface $to): array
    {
        $ranges = $this->confirmedOverlapQuery($property->id, $from, $to, null)
            ->get(['start_date', 'end_date'])
            ->map(fn (Booking $b): array => [$b->start_date->toDateString(), $b->end_date->toDateString()])
            ->concat(
                PropertyUnavailability::query()
                    ->where('property_id', $property->id)
                    ->where('starts_on', '<', $to->toDateString())
                    ->where('ends_on', '>', $from->toDateString())
                    ->get(['starts_on', 'ends_on'])
                    ->map(fn (PropertyUnavailability $u): array => [$u->starts_on->toDateString(), $u->ends_on->toDateString()])
            )
            ->sortBy(fn (array $r): string => $r[0])
            ->values();

        $merged = [];
        foreach ($ranges as [$start, $end]) {
            $last = count($merged) - 1;
            if ($last >= 0 && $start <= $merged[$last]['end']) {
                $merged[$last]['end'] = max($merged[$last]['end'], $end);

                continue;
            }
            $merged[] = ['start' => $start, 'end' => $end];
        }

        return $merged;
    }

    private function unavailabilityOverlapExists(int $propertyId, CarbonInterface $start, CarbonInterface $end): bool
    {
        return PropertyUnavailability::query()
            ->where('property_id', $propertyId)
            ->where('starts_on', '<', $end->toDateString())
            ->where('ends_on', '>', $start->toDateString())
            ->exists();
    }

    private function confirmedOverlapExists(int $propertyId, CarbonInterface $start, CarbonInterface $end, ?Booking $ignore): bool
    {
        return $this->confirmedOverlapQuery($propertyId, $start, $end, $ignore)->exists();
    }

    /** @return Builder<Booking> */
    private function confirmedOverlapQuery(int $propertyId, CarbonInterface $start, CarbonInterface $end, ?Booking $ignore)
    {
        return Booking::query()
            ->where('property_id', $propertyId)
            ->when($ignore !== null, fn ($q) => $q->whereKeyNot($ignore->getKey()))
            ->where('status', BookingStatus::Confirmed)
            ->whereNotNull('start_date')
            ->whereNotNull('end_date')
            ->where('start_date', '<', $end->toDateString())
            ->where('end_date', '>', $start->toDateString());
    }
}
