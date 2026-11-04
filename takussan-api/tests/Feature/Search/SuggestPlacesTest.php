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
 * TCK-2474 (ADR-0088) — les lieux de la suggestion : une faute dès 4 caractères, et le lieu que l'on est en train
 * d'écrire après des critères déjà compris.
 */
class SuggestPlacesTest extends TestCase
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
        Cache::forget(DatabasePlaceLexicon::CACHE_KEY);

        $this->publishedIn('Dakar', 'Almadies');
        $this->publishedIn('Dakar', 'Almadies');
        $this->publishedIn('Dakar', 'Mermoz');
        $this->publishedIn('Thiès', null);
        $this->indexProperties();
        $this->buildSuggestions();
    }

    /** AC2 — `dakr` (4 caractères, une faute) rend Dakar ; l'index des biens, lui, n'admet de faute qu'à 5. */
    public function test_ac2_une_faute_a_quatre_caracteres_rend_la_ville(): void
    {
        $places = $this->getJson($this->url.'?q=dakr')->assertOk()->json('data.places');

        $dakar = collect($places)->firstWhere('label', 'Dakar');
        $this->assertNotNull($dakar, 'places : '.json_encode($places));
        $this->assertSame('city', $dakar['kind']);
        $this->assertNull($dakar['city']);
        $this->assertSame(3, $dakar['count']);
        $this->assertSame(['city' => 'Dakar'], $dakar['criteria']);
        $this->assertSame(3, $this->getJson('/api/public/properties/search?city=Dakar')->json('meta.total'));
    }

    public function test_le_lieu_en_cours_d_ecriture_apres_des_criteres_compris(): void
    {
        $places = $this->getJson($this->url.'?q='.rawurlencode('appart 3ch alma'))->json('data.places');

        $this->assertSame(
            [['kind' => 'neighborhood', 'label' => 'Almadies', 'city' => 'Dakar', 'count' => 2, 'criteria' => ['city' => 'Dakar', 'location' => 'Almadies']]],
            $places,
        );
    }

    public function test_un_lieu_compris_reste_propose(): void
    {
        $places = $this->getJson($this->url.'?q='.rawurlencode('appart almadies'))->json('data.places');

        $this->assertSame(['Almadies'], array_column($places, 'label'));
    }

    /**
     * Revue de code du 2026-11-04 — « appart almadies vue » se lit location=Almadies, résidu « vue » : les lieux se cherchent
     * sur le lieu compris, pas sur le résidu (sous `all`, « vue » ne rend aucun lieu et Almadies manquait).
     */
    public function test_un_lieu_compris_suivi_d_un_residu_reste_propose(): void
    {
        $data = $this->getJson($this->url.'?q='.rawurlencode('appart almadies vue'))->assertOk()->json('data');

        $this->assertSame('Almadies', $data['interpretation']['criteria']['location'] ?? null);
        $this->assertSame('vue', $data['interpretation']['residue']);
        $this->assertSame(['Almadies'], array_column($data['places'], 'label'));
    }
}
