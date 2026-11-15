<?php

namespace Tests\Feature\Search;

use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Services\Search\Query\DatabasePlaceLexicon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\BuildsSearchSuggestions;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2496 — un lieu mal écrit (« mermos ») que l'index des suggestions trouve déjà devient le critère de lieu de la
 * saisie comprise, sauf si deux lieux sont aussi proches de la faute.
 */
class SuggestInterpretationToleranteTest extends TestCase
{
    use BuildsSearchSuggestions;
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private string $url = '/api/search/suggest';

    protected function setUp(): void
    {
        parent::setUp();

        $dakar = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        foreach (['Mermoz', 'Almadies', 'Darou', 'Daros'] as $quartier) {
            GeoNeighborhood::factory()->create(['geo_city_id' => $dakar->id, 'name' => $quartier, 'slug' => strtolower($quartier)]);
        }
        Cache::forget(DatabasePlaceLexicon::CACHE_KEY);

        $this->publishedIn('Dakar', 'Mermoz', ['bedrooms' => 3]);
        $this->publishedIn('Dakar', 'Mermoz', ['bedrooms' => 4]);
        $this->publishedIn('Dakar', 'Mermoz', ['bedrooms' => 1]);
        $this->publishedIn('Dakar', 'Almadies', ['bedrooms' => 3]);
        $this->publishedIn('Dakar', 'Darou', ['bedrooms' => 3]);
        $this->publishedIn('Dakar', 'Daros', ['bedrooms' => 3]);
        $this->indexProperties();
        $this->buildSuggestions();
    }

    /**
     * Revue de TCK-2496 — une faute à égale distance d'une VILLE et d'un quartier homonyme (« Mbour », ville, et
     * « Mbour », quartier de Dakar) n'est pas une ambiguïté : la ville l'emporte, comme le lexique arbitre sans faute.
     */
    public function test_ville_contre_quartier_homonyme_la_ville_l_emporte(): void
    {
        GeoCity::factory()->create(['name' => 'Mbour', 'slug' => 'mbour']);
        GeoNeighborhood::factory()->create(['geo_city_id' => GeoCity::query()->where('slug', 'dakar')->value('id'), 'name' => 'Mbour', 'slug' => 'mbour-dakar']);
        Cache::forget(DatabasePlaceLexicon::CACHE_KEY);
        $this->publishedIn('Mbour', null, ['bedrooms' => 3]);
        $this->publishedIn('Dakar', 'Mbour', ['bedrooms' => 3]);
        $this->indexProperties();
        $this->buildSuggestions();

        $temoin = $this->getJson($this->url.'?q='.rawurlencode('appart mbour'))->assertOk()->json('data.interpretation');
        $this->assertSame('Mbour', $temoin['criteria']['city'] ?? null, 'témoin sans faute');

        $interpretation = $this->getJson($this->url.'?q='.rawurlencode('appart mbourr'))->assertOk()->json('data.interpretation');
        $this->assertSame('Mbour', $interpretation['criteria']['city'] ?? null, (string) json_encode($interpretation));
        $this->assertArrayNotHasKey('location', $interpretation['criteria']);
        $this->assertNull($interpretation['residue']);
    }

    /** AC1 — « appart 3ch mermos » : le quartier Mermoz, aucun résidu, la part à la place de « mermos ». */
    public function test_ac1_le_lieu_mal_ecrit_devient_le_critere(): void
    {
        $q = 'appart 3ch mermos';
        $interpretation = $this->getJson($this->url.'?q='.rawurlencode($q))->assertOk()->json('data.interpretation');

        $this->assertEquals(
            ['type' => 'apartment', 'bedrooms' => 3, 'city' => 'Dakar', 'location' => 'Mermoz'],
            $interpretation['criteria'],
        );
        $this->assertNull($interpretation['residue']);

        $part = collect($interpretation['parts'])->firstWhere('key', 'location');
        $this->assertSame('Mermoz', $part['value']);
        $this->assertSame('mermos', mb_substr($q, $part['from'], $part['to'] - $part['from']));

        // Le compte est celui de la liste sous les critères corrigés.
        $liste = $this->getJson('/api/public/properties/search?'.http_build_query($interpretation['criteria']))->assertOk();
        $this->assertSame(2, $liste->json('meta.total'));
        $this->assertSame(2, $interpretation['count']);
    }

    /** Seul, le lieu mal écrit est aussi compris. */
    public function test_le_lieu_mal_ecrit_seul_est_compris(): void
    {
        $interpretation = $this->getJson($this->url.'?q=mermos')->assertOk()->json('data.interpretation');

        $this->assertEquals(['city' => 'Dakar', 'location' => 'Mermoz'], $interpretation['criteria']);
        $this->assertSame(3, $interpretation['count']);
    }

    /** AC2 — « daroz » est à une faute de Darou ET de Daros : le mot reste au résidu. */
    public function test_ac2_deux_lieux_aussi_proches_laissent_le_mot_en_residu(): void
    {
        $interpretation = $this->getJson($this->url.'?q='.rawurlencode('appart daroz'))->assertOk()->json('data.interpretation');

        $this->assertEquals(['type' => 'apartment'], $interpretation['criteria']);
        $this->assertSame('daroz', $interpretation['residue']);
    }

    /** Le lieu en cours d'écriture (« alma ») est proposé dans `places`, jamais deviné comme critère. */
    public function test_un_debut_de_lieu_n_est_pas_un_critere(): void
    {
        $data = $this->getJson($this->url.'?q='.rawurlencode('appart 3ch alma'))->assertOk()->json('data');

        $this->assertArrayNotHasKey('location', $data['interpretation']['criteria']);
        $this->assertSame('alma', $data['interpretation']['residue']);
        $this->assertSame(['Almadies'], array_column($data['places'], 'label'));
    }
}
