<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\PropertyBoost;
use App\Models\PropertyBoostTranche;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\ReferentialIntegrityChecker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-2396 — le vérificateur juge le jeu à l'horloge de l'application, celle qui l'a semé, et non à
 * celle de PostgreSQL : sous une horloge figée (`SeedingTextAndDeterminismTest` sème au 2026-10-25),
 * `CURRENT_DATE` rendait la vraie date, et chaque Vedette en cours manquait des jours qui, pour le
 * seed, n'avaient pas encore eu lieu. Ce test fige l'horloge à une date passée : il rougit dès que
 * l'invariant relit `CURRENT_DATE`, quel que soit le jour où il tourne.
 */
class IntegrityCheckerClockTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        CarbonImmutable::setTestNow('2026-10-25 12:00:00');
        $this->travelTo(CarbonImmutable::now());
    }

    public function test_une_vedette_semee_jusqu_a_la_veille_de_l_horloge_tient_l_invariant(): void
    {
        $vedette = $this->vedetteDepuis('2026-10-20', '2026-10-24');

        $this->assertSame(0, $this->violations(), "Vedette {$vedette->id} : statistiques du 20 au 24 pour un seed du 25.");
    }

    public function test_des_jours_manquants_avant_la_veille_restent_une_violation(): void
    {
        // Le dernier jour (le 24) peut manquer, pas l'avant-dernier : l'invariant n'a pas été assoupli.
        $this->vedetteDepuis('2026-10-20', '2026-10-22');

        $this->assertSame(1, $this->violations());
    }

    private function vedetteDepuis(string $debut, string $derniereStatistique): PropertyBoost
    {
        $vedette = PropertyBoostTranche::factory()->create(['duration_days' => 30])->boost()->firstOrFail();
        $vedette->forceFill([
            'starts_at' => CarbonImmutable::parse("{$debut} 10:00:00"),
            'ends_at' => CarbonImmutable::parse("{$debut} 10:00:00")->addDays(30),
        ])->save();

        for ($jour = CarbonImmutable::parse($debut); $jour->lessThanOrEqualTo(CarbonImmutable::parse($derniereStatistique)); $jour = $jour->addDay()) {
            DB::table('property_boost_daily_stats')->insert([
                'property_boost_id' => $vedette->id, 'date' => $jour->toDateString(), 'impressions' => 100, 'clicks' => 3,
                'created_at' => $jour->addDay(), 'updated_at' => $jour->addDay(),
            ]);
        }

        return $vedette;
    }

    private function violations(): int
    {
        return (new ReferentialIntegrityChecker)->violations()['vedette_sans_une_statistique_par_jour'];
    }
}
