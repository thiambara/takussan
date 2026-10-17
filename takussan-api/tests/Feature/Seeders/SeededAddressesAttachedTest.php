<?php

namespace Tests\Feature\Seeders;

use App\Models\Address;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use Database\Seeders\Catalog\PropertySeeder;
use Database\Seeders\Core\AgencySeeder;
use Database\Seeders\Core\UserSeeder;
use Database\Seeders\Support\FilterCoverageSeeder;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\System\GeoReferentialSeeder;
use Database\Seeders\System\TagSeeder;
use Database\Seeders\YearOfActivitySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use ReflectionClassConstant;
use Tests\TestCase;

/**
 * TCK-789 (piste P17.04) — les adresses que le seed écrit, le référentiel sait les rattacher.
 *
 * Mesuré le 2026-10-15 sur la base de dev : 200 adresses hors de Dakar portaient un quartier de
 * Dakar (« Fann » à Kaolack), 180 adresses de Dakar un quartier que le jeu ne connaît pas
 * (« Plateau », « Grand-Yoff »), et les biens hors de Dakar étaient placés à 100-584 km de leur
 * ville. Toute mesure de dev sur les quartiers « hors référentiel » jugeait donc un artefact.
 *
 * Même mini-pipeline que {@see FilterCoverageTagsTest}, précédé du référentiel, comme dans
 * {@see YearOfActivitySeeder::PIPELINE}.
 */
class SeededAddressesAttachedTest extends TestCase
{
    use RefreshDatabase;

    /** Le seed place un bien à ±0,04° du centre de sa ville : moins de 7 km. */
    private const DISTANCE_MAX_KM = 10.0;

    /** Un seul seed par test : le mini-pipeline, référentiel compris, prend près d'une minute. */
    private function semer(): void
    {
        $context = new SeedingContext(new SeedingConfig(
            agencies: 1,
            propertiesPerAgency: 60,
            includeEdgeCases: false,
            ensureReferentialIntegrity: false,
            includeFilterCoverage: true,
            includeDemoUsers: false,
            downloadMedia: false,
        ));
        app()->instance(SeedingContext::class, $context);

        foreach ([GeoReferentialSeeder::class, TagSeeder::class, AgencySeeder::class, UserSeeder::class, PropertySeeder::class, FilterCoverageSeeder::class] as $classe) {
            app()->call([app($classe), 'run']);
        }
    }

    public function test_le_referentiel_est_charge_avant_les_seeders_qui_ecrivent_des_adresses(): void
    {
        $pipeline = (new ReflectionClassConstant(YearOfActivitySeeder::class, 'PIPELINE'))->getValue();
        $geo = array_search(GeoReferentialSeeder::class, $pipeline, true);

        $this->assertNotFalse($geo);
        $this->assertLessThan(array_search(PropertySeeder::class, $pipeline, true), $geo);
        $this->assertLessThan(array_search(FilterCoverageSeeder::class, $pipeline, true), $geo);
    }

    public function test_les_adresses_semees_sont_rattachees_et_placees_dans_leur_ville(): void
    {
        $this->semer();

        $this->quartiersRattaches();
        $this->placeesPresDuCentre();
    }

    private function quartiersRattaches(): void
    {
        $avecQuartier = $this->adresses()->filter(fn (Address $a) => filled($a->neighborhood));

        $this->assertGreaterThan(20, $avecQuartier->count(), 'non-vacuité : des adresses semées portent un quartier');
        $this->assertTrue(
            $avecQuartier->contains(fn (Address $a) => $a->city !== 'Dakar'),
            'non-vacuité : un quartier semé hors de Dakar',
        );

        $orphelines = $avecQuartier
            ->filter(function (Address $a) {
                $quartier = $a->geo_neighborhood_id ? GeoNeighborhood::query()->find($a->geo_neighborhood_id) : null;

                return $quartier === null || (int) $quartier->geo_city_id !== (int) $a->geo_city_id;
            })
            ->map(fn (Address $a) => "{$a->neighborhood} ({$a->city})")
            ->unique()
            ->values()
            ->all();

        $this->assertSame([], $orphelines, 'toute adresse semée avec un quartier est rattachée à un quartier de sa ville');
    }

    private function placeesPresDuCentre(): void
    {
        $adresses = $this->adresses();
        $this->assertTrue($adresses->contains(fn (Address $a) => $a->city !== 'Dakar'), 'non-vacuité : des villes hors de Dakar');

        $loin = [];
        foreach ($adresses as $adresse) {
            $ville = $adresse->geo_city_id ? GeoCity::query()->find($adresse->geo_city_id) : null;
            $this->assertNotNull($ville, "ville semée hors référentiel : {$adresse->city}");

            $km = $this->distanceKm((float) $adresse->latitude, (float) $adresse->longitude, (float) $ville->latitude, (float) $ville->longitude);
            if ($km > self::DISTANCE_MAX_KM) {
                $loin[] = sprintf('%s à %.0f km', $ville->name, $km);
            }
        }

        $this->assertSame([], array_values(array_unique($loin)), 'toute adresse semée est placée près du centre de sa ville');
    }

    /** @return Collection<int, Address> */
    private function adresses(): Collection
    {
        return Address::query()->where('addressable_type', Property::class)->get();
    }

    private function distanceKm(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;

        return 6371 * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }
}
