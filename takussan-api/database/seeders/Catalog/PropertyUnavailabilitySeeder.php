<?php

namespace Database\Seeders\Catalog;

use App\Models\Booking;
use App\Models\PropertyUnavailability;
use App\Services\Booking\PropertyAvailabilityService;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;

/**
 * TCK-2379 — les jours qu'un hôte ferme à la main sur le calendrier d'un bien réservable
 * (`PropertyUnavailabilityController::store`) : travaux, séjour du propriétaire. Comme le contrôleur,
 * jamais sur une réservation confirmée (`unavailability.overlaps_booking`), et pas deux blocages qui
 * se recouvrent.
 */
class PropertyUnavailabilitySeeder extends Seeder
{
    public function __construct(
        private readonly SeedingContext $ctx,
        private readonly PropertyAvailabilityService $disponibilites,
    ) {}

    public function run(): void
    {
        $maintenant = CarbonImmutable::now();
        $reservables = Booking::query()->select('property_id', 'agency_id')->whereNotNull('agency_id')->distinct()
            ->orderBy('property_id')->get()->groupBy('agency_id')->sortKeys();

        // La moitié des biens réservables de chaque agence, au moins un : un hôte sur deux ferme des jours.
        foreach ($reservables as $biens) {
            foreach (Tirage::plusieurs($biens->values(), max(1, intdiv($biens->count(), 2))) as $reservable) {
                $this->bloquer($reservable, $maintenant);
            }
        }
    }

    private function bloquer(Booking $reservable, CarbonImmutable $maintenant): void
    {
        $poses = [];
        $voulus = mt_rand(1, 3);
        // Une date qui heurte une réservation confirmée ou un blocage posé se retire ; dix essais au plus.
        for ($essai = 0; count($poses) < $voulus && $essai < 10; $essai++) {
            $debut = Timeline::randomDateBetween($maintenant->subMonths(8), $maintenant->addMonths(2))->startOfDay();
            $fin = $debut->addDays(mt_rand(1, 6));
            $chevauche = collect($poses)->contains(fn (array $p) => $debut->lessThanOrEqualTo($p[1]) && $fin->greaterThanOrEqualTo($p[0]));
            if ($chevauche || $this->disponibilites->confirmedOverlap((int) $reservable->property_id, $debut, $fin) !== null) {
                continue;
            }
            $poseLe = collect([$debut->subDays(mt_rand(3, 25))->setTime(mt_rand(8, 19), mt_rand(0, 59)), $maintenant->subHours(1)])->min();

            Timeline::aLaDate($poseLe, fn () => PropertyUnavailability::query()->create([
                'property_id' => $reservable->property_id,
                'starts_on' => $debut->toDateString(),
                'ends_on' => $fin->toDateString(),
                'reason' => $this->ctx->texts()->motifDIndisponibilite(),
                'source' => PropertyUnavailability::SOURCE_MANUAL,
                'created_by_id' => $this->ctx->agentAu((int) $reservable->agency_id, $poseLe),
            ]));
            $poses[] = [$debut, $fin];
        }
    }
}
