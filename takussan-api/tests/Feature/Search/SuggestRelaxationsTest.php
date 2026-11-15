<?php

namespace Tests\Feature\Search;

use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Services\Search\Query\DatabasePlaceLexicon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\BuildsSearchSuggestions;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2496 — sous un compte nul, la suggestion dit combien de biens rendrait le retrait de chaque critère compris :
 * au plus trois, du plus grand compte au plus petit, chacun égal au compte de la liste sans ce critère.
 */
class SuggestRelaxationsTest extends TestCase
{
    use BuildsSearchSuggestions;
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private string $url = '/api/search/suggest';

    protected function setUp(): void
    {
        parent::setUp();

        $dakar = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $dakar->id, 'name' => 'Almadies', 'slug' => 'almadies']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $dakar->id, 'name' => 'Mermoz', 'slug' => 'mermoz']);
        Cache::forget(DatabasePlaceLexicon::CACHE_KEY);

        // Aucun appartement d'au moins 3 chambres aux Almadies.
        // Sans `location` : 3 (Mermoz) ; sans `bedrooms` : 2 ; sans `type` : 1 (une maison).
        $this->publishedIn('Dakar', 'Mermoz', ['bedrooms' => 3, 'title' => 'Appartement Mermoz A']);
        $this->publishedIn('Dakar', 'Mermoz', ['bedrooms' => 3, 'title' => 'Appartement Mermoz B']);
        $this->publishedIn('Dakar', 'Mermoz', ['bedrooms' => 4, 'title' => 'Appartement Mermoz C']);
        $this->publishedIn('Dakar', 'Almadies', ['bedrooms' => 2, 'title' => 'Appartement Almadies A']);
        $this->publishedIn('Dakar', 'Almadies', ['bedrooms' => 1, 'title' => 'Appartement Almadies B']);
        $this->publishedIn('Dakar', 'Almadies', ['bedrooms' => 3, 'type' => PropertyType::House, 'title' => 'Maison Almadies']);
        // Ne comptent jamais : un brouillon et un bien de test qui satisferaient tout.
        $this->publishedIn('Dakar', 'Almadies', ['bedrooms' => 3, 'status' => PropertyStatus::Draft, 'published_at' => null]);
        $this->publishedIn('Dakar', 'Almadies', ['bedrooms' => 3, 'is_test' => true]);
        $this->indexProperties();
        $this->buildSuggestions();
    }

    /** AC3 — compte nul : les critères ordonnés, chaque compte égal à celui de la liste sans ce critère. */
    public function test_ac3_un_compte_nul_rend_les_criteres_a_retirer(): void
    {
        $interpretation = $this->getJson($this->url.'?q='.rawurlencode('appart 3ch almadies'))->assertOk()->json('data.interpretation');

        $this->assertSame(0, $interpretation['count']);
        $this->assertSame(
            [['key' => 'location', 'count' => 3], ['key' => 'bedrooms', 'count' => 2], ['key' => 'type', 'count' => 1]],
            $interpretation['relaxations'],
        );

        foreach ($interpretation['relaxations'] as ['key' => $cle, 'count' => $compte]) {
            $criteres = $interpretation['criteria'];
            unset($criteres[$cle]);
            $this->assertSame(
                $compte,
                $this->getJson('/api/public/properties/search?'.http_build_query($criteres))->json('meta.total'),
                "sans {$cle}",
            );
        }
    }

    /** Le texte incompris se retire aussi (`q`) ; aucun retrait utile : une liste vide, présente. */
    public function test_le_texte_incompris_est_un_critere_a_retirer(): void
    {
        $interpretation = $this->getJson($this->url.'?q='.rawurlencode('appart 3ch almadies lumineux'))->json('data.interpretation');

        $this->assertSame('lumineux', $interpretation['residue']);
        $this->assertSame(0, $interpretation['count']);
        // Un seul critère retiré ne suffit pas (il en faudrait deux) : rien n'est proposé.
        $this->assertSame([], $interpretation['relaxations']);

        $sansTexte = $this->getJson($this->url.'?q='.rawurlencode('appart almadies lumineux'))->json('data.interpretation');
        $this->assertSame(0, $sansTexte['count']);
        $this->assertSame(['key' => 'q', 'count' => 2], $sansTexte['relaxations'][0]);
    }

    /** Sous la base de la page, la base reste : retirer le quartier compte encore la base. */
    public function test_les_comptes_portent_la_base(): void
    {
        $interpretation = $this->getJson($this->url.'?'.http_build_query(['q' => 'appart 3ch almadies', 'bedrooms' => 4]))
            ->json('data.interpretation');

        // `bedrooms` est compris dans la saisie (3) : il remplace la base. Sans lui, la base (4) revient.
        $this->assertSame(['key' => 'location', 'count' => 3], $interpretation['relaxations'][0]);
        $bedrooms = collect($interpretation['relaxations'])->firstWhere('key', 'bedrooms');
        $this->assertNull($bedrooms, 'sans « 3ch », la base « 4 chambres » revient et ne rend rien aux Almadies');
    }

    /** Compte non nul : pas de `relaxations`. */
    public function test_un_compte_non_nul_n_a_pas_de_relaxations(): void
    {
        $interpretation = $this->getJson($this->url.'?q='.rawurlencode('appart 3ch mermoz'))->json('data.interpretation');

        $this->assertSame(3, $interpretation['count']);
        $this->assertArrayNotHasKey('relaxations', $interpretation);
    }
}
