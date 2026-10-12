<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-633 — une fusion et un renommage RÉINDEXENT (ADR-0062 §4) : la recherche lit le texte du quartier, et sans réindexation le
 * bien resterait trouvable sous l'ancien nom et introuvable sous le nouveau.
 */
class GeoNeighborhoodMergeSearchTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @return list<int> */
    private function biensDuQuartier(string $nom): array
    {
        return Property::search('')->where('neighborhood', $nom)->keys()->map(fn ($k) => (int) $k)->all();
    }

    public function test_une_fusion_rend_le_bien_trouvable_sous_le_nom_de_la_cible(): void
    {
        $this->actingAsRole('super_admin');
        $ville = GeoCity::factory()->create(['slug' => 'dakar', 'name' => 'Dakar']);
        $cible = GeoNeighborhood::factory()->for($ville, 'city')->create(['name' => 'Liberté 4', 'slug' => 'liberte-4']);
        $source = GeoNeighborhood::factory()->for($ville, 'city')->pending(User::factory()->create())->create(['name' => 'Liberte Quatre', 'slug' => 'liberte-quatre']);
        $bien = Property::factory()->published()->create();
        Address::factory()->create([
            'addressable_type' => Property::class, 'addressable_id' => $bien->id,
            'geo_city_id' => $ville->id, 'geo_neighborhood_id' => $source->id,
            'city' => 'Dakar', 'neighborhood' => 'Liberte Quatre',
        ]);
        $this->indexProperties();
        $this->assertSame([$bien->id], $this->biensDuQuartier('Liberte Quatre'));

        $this->postJson("/api/admin/geo/neighborhoods/{$source->id}/merge", ['into_id' => $cible->id])->assertOk();
        $this->waitForMeilisearch();

        $this->assertSame([$bien->id], $this->biensDuQuartier('Liberté 4'));
        $this->assertSame([], $this->biensDuQuartier('Liberte Quatre'));
    }

    public function test_un_renommage_rend_le_bien_trouvable_sous_le_nouveau_nom(): void
    {
        $this->actingAsRole('super_admin');
        $ville = GeoCity::factory()->create(['slug' => 'dakar', 'name' => 'Dakar']);
        $quartier = GeoNeighborhood::factory()->for($ville, 'city')->pending(User::factory()->create())->create(['name' => 'Sicap Lib', 'slug' => 'sicap-lib']);
        $bien = Property::factory()->published()->create();
        Address::factory()->create([
            'addressable_type' => Property::class, 'addressable_id' => $bien->id,
            'geo_city_id' => $ville->id, 'geo_neighborhood_id' => $quartier->id,
            'city' => 'Dakar', 'neighborhood' => 'Sicap Lib',
        ]);
        $this->indexProperties();
        $this->assertSame([$bien->id], $this->biensDuQuartier('Sicap Lib'));

        $this->patchJson("/api/admin/geo/neighborhoods/{$quartier->id}", ['name' => 'Sicap Liberté'])->assertOk();
        $this->waitForMeilisearch();

        $this->assertSame('Sicap Liberté', $bien->address()->firstOrFail()->neighborhood);
        $this->assertSame([$bien->id], $this->biensDuQuartier('Sicap Liberté'));
        $this->assertSame([], $this->biensDuQuartier('Sicap Lib'));
    }
}
