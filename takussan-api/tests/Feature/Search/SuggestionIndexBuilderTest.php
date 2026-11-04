<?php

namespace Tests\Feature\Search;

use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\SearchAlias;
use App\Services\Search\Query\DatabasePlaceLexicon;
use App\Services\Search\Suggestions\SuggestionIndex;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Meilisearch\Client;
use Meilisearch\Contracts\IndexesQuery;
use Tests\Concerns\BuildsSearchSuggestions;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2474 (ADR-0088) — l'index des suggestions : ce qu'il contient, ce qu'il compte, comment il est mis en service.
 */
class SuggestionIndexBuilderTest extends TestCase
{
    use BuildsSearchSuggestions;
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::forget(DatabasePlaceLexicon::CACHE_KEY);
    }

    public function test_villes_quartiers_et_types_du_catalogue_public_avec_le_compte_de_la_liste(): void
    {
        foreach (range(1, 3) as $i) {
            $this->publishedIn('Dakar', 'Mermoz');
        }
        $this->publishedIn('Dakar', 'Almadies', ['type' => PropertyType::Room]);
        // Vendu : public, publié, mais écarté par la 4ᵉ clause de `publicFilter()`. Brouillon : pas public.
        $this->publishedIn('Dakar', 'Mermoz')->forceFill(['status' => PropertyStatus::Sold])->save();
        $this->publishedIn('Thiès', 'Randoulène', ['status' => PropertyStatus::Draft, 'published_at' => null]);
        $this->indexProperties();

        $this->buildSuggestions();
        $docs = collect($this->suggestionDocuments())->keyBy(fn (array $d): string => $d['kind'].'|'.$d['value'].'|'.$d['city']);

        $this->assertSame(4, $docs['city|Dakar|']['count']);
        $this->assertSame(['city' => 'Dakar'], $docs['city|Dakar|']['criteria']);
        $this->assertSame(3, $docs['neighborhood|Mermoz|Dakar']['count']);
        $this->assertSame(['city' => 'Dakar', 'location' => 'Mermoz'], $docs['neighborhood|Mermoz|Dakar']['criteria']);
        $this->assertSame(1, $docs['neighborhood|Almadies|Dakar']['count']);
        $this->assertSame(3, $docs['property_type|apartment|']['count']);
        $this->assertSame('Appartement', $docs['property_type|apartment|']['label_fr']);
        $this->assertSame('Apartment', $docs['property_type|apartment|']['label_en']);
        $this->assertSame(1, $docs['property_type|room|']['count']);
        $this->assertContains('colocation', $docs['property_type|room|']['aliases'], 'les écritures de Property::TYPE_SEARCH_ALIASES');

        // Rien de ce que la liste ne rend pas : ni la ville du brouillon, ni un type sans bien.
        $this->assertArrayNotHasKey('city|Thiès|', $docs->all());
        $this->assertArrayNotHasKey('property_type|house|', $docs->all());

        // Le compte d'un lieu EST le total de la liste sous ses critères.
        foreach (['city|Dakar|', 'neighborhood|Mermoz|Dakar', 'property_type|apartment|'] as $key) {
            $total = $this->getJson('/api/public/properties/search?'.http_build_query($docs[$key]['criteria']))->json('meta.total');
            $this->assertSame($total, $docs[$key]['count'], $key);
        }
    }

    public function test_les_ecritures_d_un_meme_quartier_se_regroupent_sous_le_nom_du_referentiel(): void
    {
        $dakar = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $dakar->id, 'name' => 'Grand Yoff', 'slug' => 'grand-yoff', 'former_names' => ['Grand Yof']]);
        $this->publishedIn('Dakar', 'Grand-Yoff');
        $this->publishedIn('Dakar', 'grand yoff');
        $this->indexProperties();

        $this->buildSuggestions();
        $quartiers = collect($this->suggestionDocuments())->where('kind', SuggestionIndex::KIND_NEIGHBORHOOD)->values();

        $this->assertCount(1, $quartiers);
        $this->assertSame('Grand Yoff', $quartiers[0]['value']);
        $this->assertSame(2, $quartiers[0]['count']);
        $this->assertContains('Grand Yof', $quartiers[0]['aliases']);
        $this->assertSame(2, $this->getJson('/api/public/properties/search?city=Dakar&location=Grand%20Yoff')->json('meta.total'));
    }

    public function test_les_recherches_populaires_suivent_le_seuil_d_adr_0088_et_comptent_les_biens(): void
    {
        $this->publishedIn('Dakar', 'Mermoz', ['title' => 'Appartement lumineux']);
        $this->publishedIn('Dakar', 'Mermoz', ['title' => 'Appartement calme']);
        $this->indexProperties();

        $this->journalVisitors(5, 'appartement', ['city' => 'Dakar']);
        $this->journalVisitors(4, 'mermoz', [], 3, 'b');              // sous le seuil
        $this->journalVisitors(5, 'appartement introuvable', [], 0, 'c'); // dernier résultat nul

        $this->buildSuggestions();
        $requetes = collect($this->suggestionDocuments())->where('kind', SuggestionIndex::KIND_QUERY)->values();

        $this->assertSame(['appartement'], $requetes->pluck('value')->all());
        $this->assertSame(['city' => 'Dakar'], $requetes[0]['criteria']);
        $this->assertSame(5, $requetes[0]['weight'], 'le poids est la popularité (visiteurs-jours)');
        $this->assertSame(2, $requetes[0]['count'], 'le compte est celui des biens que la liste rend');
        $this->assertSame(2, $this->getJson('/api/public/properties/search?q=appartement&city=Dakar')->json('meta.total'));
    }

    public function test_une_reconstruction_remplace_l_index_entier_et_ne_laisse_aucun_index_temporaire(): void
    {
        $mermoz = $this->publishedIn('Dakar', 'Mermoz');
        $this->publishedIn('Saint-Louis', null);
        $this->indexProperties();
        $this->buildSuggestions();
        $this->assertContains('Mermoz', array_column($this->suggestionDocuments(), 'value'));

        $mermoz->forceFill(['status' => PropertyStatus::Sold])->save();
        $this->indexProperties();
        $resultat = $this->buildSuggestions();

        $valeurs = array_column($this->suggestionDocuments(), 'value');
        $this->assertNotContains('Mermoz', $valeurs);
        $this->assertContains('Saint-Louis', $valeurs);
        $this->assertSame(count($valeurs), $resultat['documents']);

        $uids = array_map(fn ($i) => $i->getUid(), app(Client::class)->getIndexes((new IndexesQuery)->setLimit(1000))->getResults());
        $this->assertSame([], array_values(array_filter($uids, fn (string $u): bool => str_starts_with($u, SuggestionIndex::uid().SuggestionIndex::BUILD_MARKER))));
    }

    public function test_les_reglages_sont_poses_sur_l_index_servi(): void
    {
        $this->publishedIn('Dakar', null);
        $this->indexProperties();
        $this->buildSuggestions();

        $reglages = app(Client::class)->index(SuggestionIndex::uid())->getSettings();

        $this->assertSame(['label_fr', 'label_en', 'label_wo', 'aliases'], $reglages['searchableAttributes']);
        $this->assertSame(['kind'], $reglages['filterableAttributes']);
        $this->assertSame(['weight'], $reglages['sortableAttributes']);
        $this->assertSame(['oneTypo' => 4, 'twoTypos' => 8], $reglages['typoTolerance']['minWordSizeForTypos']);
        $this->assertSame('weight:desc', $reglages['rankingRules'][array_search('exactness', $reglages['rankingRules'], true) + 1]);
    }

    /** TCK-2476 — la table existe désormais (migration `create_search_aliases_table`) : les variantes actives s'ajoutent. */
    public function test_les_variantes_actives_de_tck_2476_s_ajoutent_quand_la_table_existe(): void
    {
        $this->publishedIn('Dakar', 'Ouakam');
        $this->indexProperties();
        foreach ([
            ['alias' => 'wakam', 'target_kind' => 'neighborhood', 'target_value' => 'Ouakam', 'target_city' => 'Dakar', 'status' => 'active'],
            ['alias' => 'apparts', 'target_kind' => 'property_type', 'target_value' => 'apartment', 'target_city' => null, 'status' => 'active'],
            ['alias' => 'oukam', 'target_kind' => 'neighborhood', 'target_value' => 'Ouakam', 'target_city' => 'Dakar', 'status' => 'rejected'],
        ] as $row) {
            SearchAlias::query()->create($row);
        }

        $this->buildSuggestions();
        $docs = collect($this->suggestionDocuments())->keyBy('value');

        $this->assertContains('wakam', $docs['Ouakam']['aliases']);
        $this->assertNotContains('oukam', $docs['Ouakam']['aliases']);
        $this->assertContains('apparts', $docs['apartment']['aliases']);
    }

    public function test_if_missing_ne_reconstruit_pas_un_index_servi(): void
    {
        $this->publishedIn('Dakar', null);
        $this->indexProperties();
        $client = app(Client::class);
        $client->waitForTask($client->deleteIndex(SuggestionIndex::uid())['taskUid']);

        $this->assertSame(0, Artisan::call('search:build-suggestions', ['--if-missing' => true]));
        $this->assertStringContainsString('documents', Artisan::output());
        $this->assertSame(0, Artisan::call('search:build-suggestions', ['--if-missing' => true]));
        $this->assertStringContainsString('déjà servi', Artisan::output());
    }

    public function test_la_construction_est_planifiee_toutes_les_heures(): void
    {
        $evenement = collect(app(Schedule::class)->events())
            ->first(fn ($e) => str_contains((string) $e->command, 'search:build-suggestions'));

        $this->assertNotNull($evenement, 'planifiée dans routes/console.php');
        $this->assertSame('0 * * * *', $evenement->expression);
    }
}
