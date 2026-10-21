<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Property;
use App\Services\Geo\GeoReindexation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-1100 (P90.05) — `GeoReindexation::biens()` charge d'avance ce que `shouldBeSearchable()` et
 * `toSearchableArray()` lisent (agence, adresse, étiquettes visibles), comme
 * `Property::makeAllSearchableUsing()`. Sans cela : une à trois requêtes de plus PAR bien, sur un
 * chemin qui réindexe tous les biens d'un quartier renommé.
 */
class GeoReindexationRequetesTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @return list<int> */
    private function biens(int $n): array
    {
        $agence = Agency::factory()->create();
        $ids = [];
        foreach (range(1, $n) as $_) {
            $bien = Property::factory()->published()->create(['agency_id' => $agence->id, 'published_at' => now()->subHour()]);
            Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $bien->id]);
            $ids[] = $bien->id;
        }

        return $ids;
    }

    private function requetesPour(array $ids): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        app(GeoReindexation::class)->biens($ids);
        $compte = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $compte;
    }

    public function test_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_biens(): void
    {
        $trois = $this->requetesPour($this->biens(3));
        $dix = $this->requetesPour($this->biens(10));

        $this->assertSame($trois, $dix, "3 biens : {$trois} requêtes, 10 biens : {$dix}");
    }

    public function test_les_biens_reindexes_sont_dans_l_index(): void
    {
        $ids = $this->biens(3);
        Property::removeAllFromSearch();
        $this->waitForMeilisearch();

        app(GeoReindexation::class)->biens($ids);
        $this->waitForMeilisearch();

        $this->assertEqualsCanonicalizing($ids, Property::search('')->keys()->map(fn ($k) => (int) $k)->all());
    }
}
