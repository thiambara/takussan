<?php

namespace Tests\Feature\Search;

use App\Jobs\RefreshNewBuildSearchLabel;
use App\Models\Address;
use App\Models\Agency;
use App\Models\Property;
use App\Support\Search\PropertyLabels;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-1101 (P90.06) — le job quotidien du jeton « neuf » réindexe par lots, en chargeant d'avance
 * ce que `shouldBeSearchable()` et `toSearchableArray()` lisent, comme
 * `Property::makeAllSearchableUsing()`.
 */
class RefreshNewBuildSearchLabelRequetesTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private function biens(int $n): void
    {
        $agence = Agency::factory()->create();
        foreach (range(1, $n) as $_) {
            $bien = Property::factory()->published()->create([
                'agency_id' => $agence->id,
                'year_built' => PropertyLabels::anneeNeufMin(),
                'condition' => null,
                'published_at' => now()->subHour(),
            ]);
            Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $bien->id]);
        }
    }

    private function requetesDuJob(): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        (new RefreshNewBuildSearchLabel)->handle();
        $compte = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $compte;
    }

    public function test_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_biens(): void
    {
        $this->biens(3);
        $trois = $this->requetesDuJob();
        $this->biens(7);
        $dix = $this->requetesDuJob();

        $this->assertSame($trois, $dix, "3 biens : {$trois} requêtes, 10 biens : {$dix}");
    }

    public function test_les_biens_du_perimetre_sont_dans_l_index(): void
    {
        $this->biens(3);
        Property::removeAllFromSearch();
        $this->waitForMeilisearch();

        (new RefreshNewBuildSearchLabel)->handle();
        $this->waitForMeilisearch();

        $this->assertEqualsCanonicalizing(
            RefreshNewBuildSearchLabel::scope()->pluck('id')->all(),
            Property::search('')->keys()->map(fn ($k) => (int) $k)->all(),
        );
    }
}
