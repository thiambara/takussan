<?php

namespace Tests\Feature\Boost;

use App\Models\Property;
use App\Services\Admin\PlatformSettingService;
use App\Services\Boost\LegacyFeaturedConversion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2208 (P122.04, décision du porteur) — `LegacyFeaturedConversion` réécrit `featured` et
 * `sponsored_until` par `DB::table()`, que l'observateur de Scout ne voit pas : l'index gardait
 * `featured = true` pour un bien sans agence, et le vivier des vedettes le servait en emplacement
 * sponsorisé sans boost. La conversion réindexe désormais les biens qu'elle touche
 * (`takussan-api/CLAUDE.md` § Recherche, TCK-1990).
 */
class LegacyFeaturedConversionIndexTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @return list<int> */
    private function sponsorises(): array
    {
        return array_column($this->getJson('/api/public/properties/search?per_page=5')->assertOk()->json('sponsored'), 'id');
    }

    public function test_un_bien_sans_agence_ne_reste_pas_vedette_dans_l_index(): void
    {
        $sansEspace = Property::factory()->published()->create(['agency_id' => null, 'featured' => true]);
        Property::factory()->count(2)->published()->create();
        $this->indexProperties();
        app(PlatformSettingService::class)->bulkUpdate([
            'boost.sponsored_slots_per_page' => 5,
            'boost.reserved_top_results' => 0,
        ], $this->actingAsRole('super_admin'));

        // Témoin de harnais : avant la conversion, l'index le sert bien en vedette.
        $this->assertContains($sansEspace->id, $this->sponsorises());

        app(LegacyFeaturedConversion::class)->run();
        $this->waitForMeilisearch();

        $this->assertFalse((bool) $sansEspace->fresh()->featured);
        $this->assertNotContains($sansEspace->id, $this->sponsorises(), 'l\'index suit la base');
    }
}
