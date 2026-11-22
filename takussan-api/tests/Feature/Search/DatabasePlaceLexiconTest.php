<?php

namespace Tests\Feature\Search;

use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\User;
use App\Services\Search\Query\DatabasePlaceLexicon;
use App\Services\Search\Query\PlaceLexicon;
use App\Services\Search\Query\SearchQueryParser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * TCK-2473 (ADR-0088) — les lieux de l'analyse de la saisie sont ceux du référentiel que lisent les filtres `location`
 * et `city` : villes, quartiers approuvés, anciens noms, fusions.
 */
class DatabasePlaceLexiconTest extends TestCase
{
    use RefreshDatabase;

    private GeoCity $dakar;

    protected function setUp(): void
    {
        parent::setUp();

        $this->dakar = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
    }

    private function lexicon(): PlaceLexicon
    {
        Cache::forget(DatabasePlaceLexicon::CACHE_KEY);

        return app(PlaceLexicon::class);
    }

    /** @param  list<string>  $words */
    private function match(array $words): ?array
    {
        return $this->lexicon()->longestMatch($words);
    }

    public function test_le_conteneur_lie_le_lexique_du_referentiel(): void
    {
        $this->assertInstanceOf(DatabasePlaceLexicon::class, app(PlaceLexicon::class));
    }

    public function test_un_quartier_approuve_se_reconnait_avec_sa_ville_sans_casse_ni_accents(): void
    {
        GeoNeighborhood::factory()->create(['geo_city_id' => $this->dakar->id, 'name' => 'Sacré-Cœur', 'slug' => 'sacre-coeur']);

        $this->assertSame(
            ['kind' => 'neighborhood', 'name' => 'Sacré-Cœur', 'city' => 'Dakar', 'length' => 2],
            $this->match(['sacre', 'coeur', '3', 'chambres']),
        );
        $this->assertSame('Sacré-Cœur', $this->match(['SACRÉ', 'CŒUR'])['name'] ?? null);
    }

    public function test_une_ville_se_reconnait_sous_son_nom_et_ses_anciens_noms(): void
    {
        GeoCity::factory()->create(['name' => 'Thiès', 'slug' => 'thies', 'former_names' => ['Thies Ville']]);

        $this->assertSame(['kind' => 'city', 'name' => 'Thiès', 'city' => null, 'length' => 1], $this->match(['thies']));
        $this->assertSame(['kind' => 'city', 'name' => 'Thiès', 'city' => null, 'length' => 2], $this->match(['thies', 'ville']));
    }

    public function test_le_plus_long_lieu_l_emporte(): void
    {
        GeoNeighborhood::factory()->create(['geo_city_id' => $this->dakar->id, 'name' => 'Yoff', 'slug' => 'yoff']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $this->dakar->id, 'name' => 'Grand Yoff', 'slug' => 'grand-yoff']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $this->dakar->id, 'name' => 'HLM Grand Yoff', 'slug' => 'hlm-grand-yoff']);

        $this->assertSame('HLM Grand Yoff', $this->match(['hlm', 'grand', 'yoff', 'villa'])['name'] ?? null);
        $this->assertSame('Grand Yoff', $this->match(['grand', 'yoff'])['name'] ?? null);
        $this->assertNull($this->match(['grand', 'standing']));
    }

    public function test_une_proposition_en_attente_ou_refusee_n_est_pas_un_lieu(): void
    {
        $auteur = User::factory()->create();
        GeoNeighborhood::factory()->pending($auteur)->create(['geo_city_id' => $this->dakar->id, 'name' => 'Chez Moussa', 'slug' => 'chez-moussa']);
        GeoNeighborhood::factory()->rejected()->create(['geo_city_id' => $this->dakar->id, 'name' => 'Nulle Part', 'slug' => 'nulle-part']);

        $this->assertNull($this->match(['chez', 'moussa']));
        $this->assertNull($this->match(['nulle', 'part']));
    }

    public function test_un_ancien_nom_et_un_quartier_fusionne_designent_le_quartier_actuel(): void
    {
        $cible = GeoNeighborhood::factory()->create([
            'geo_city_id' => $this->dakar->id, 'name' => 'Liberté 4', 'slug' => 'liberte-4', 'former_names' => ['Liberte Quatre'],
        ]);
        GeoNeighborhood::factory()->create([
            'geo_city_id' => $this->dakar->id, 'name' => 'Liberté IV', 'slug' => 'liberte-iv', 'merged_into_id' => $cible->id,
        ]);

        $this->assertSame('Liberté 4', $this->match(['liberte', 'quatre'])['name'] ?? null);
        $this->assertSame('Liberté 4', $this->match(['liberte', 'iv'])['name'] ?? null);
    }

    public function test_un_nom_ville_et_quartier_est_la_ville_un_quartier_de_deux_villes_n_a_pas_de_ville(): void
    {
        $saintLouis = GeoCity::factory()->create(['name' => 'Saint-Louis', 'slug' => 'saint-louis']);
        GeoCity::factory()->create(['name' => 'Pikine', 'slug' => 'pikine']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $saintLouis->id, 'name' => 'Pikine', 'slug' => 'pikine']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $this->dakar->id, 'name' => 'Médina', 'slug' => 'medina']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $saintLouis->id, 'name' => 'Médina', 'slug' => 'medina-2']);

        $this->assertSame(['kind' => 'city', 'name' => 'Pikine', 'city' => null, 'length' => 1], $this->match(['pikine']));
        $this->assertSame(['kind' => 'neighborhood', 'name' => 'Médina', 'city' => null, 'length' => 1], $this->match(['medina']));
    }

    public function test_le_parseur_resolu_par_le_conteneur_lit_le_referentiel(): void
    {
        GeoNeighborhood::factory()->create(['geo_city_id' => $this->dakar->id, 'name' => 'Almadies', 'slug' => 'almadies']);
        Cache::forget(DatabasePlaceLexicon::CACHE_KEY);

        $r = app(SearchQueryParser::class)->parse('appart 3ch Almadies moins de 500k', 'fr');

        $this->assertSame(
            ['type' => 'apartment', 'price_max' => 500_000, 'bedrooms' => 3, 'city' => 'Dakar', 'location' => 'Almadies'],
            $r->criteria,
        );
    }

    public function test_le_lexique_est_en_cache(): void
    {
        GeoNeighborhood::factory()->create(['geo_city_id' => $this->dakar->id, 'name' => 'Ngor', 'slug' => 'ngor']);
        $this->assertNotNull($this->match(['ngor']));

        GeoNeighborhood::query()->where('name', 'Ngor')->delete();

        $this->assertNotNull(app(PlaceLexicon::class)->longestMatch(['ngor']), 'lu dans le cache');
        $this->assertNull($this->match(['ngor']), 'relu après expiration');
    }
}
