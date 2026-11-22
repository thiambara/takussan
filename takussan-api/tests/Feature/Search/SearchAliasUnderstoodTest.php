<?php

namespace Tests\Feature\Search;

use App\Ai\Agents\SearchAliasProposals;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\SearchAliasStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\SearchAlias;
use App\Models\SearchAliasSetting;
use App\Models\SearchQueryStat;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;
use App\Services\Search\Aliases\SearchAliasCurator;
use App\Services\Search\Query\SearchQueryParser;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\BuildsSearchSuggestions;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2476 (ADR-0088 §7) — AC3 : une variante ACTIVE est comprise par l'analyse de la saisie et trouvée dans l'index des
 * suggestions. De bout en bout : le passage (modèle doublé) crée « wakam → Ouakam », « aprt → appartement », « clime →
 * climatisation » ; puis `q=wakam` se lit `location=Ouakam`, et la barre trouve Ouakam sous « wakam ».
 */
class SearchAliasUnderstoodTest extends TestCase
{
    use BuildsSearchSuggestions;
    use InteractsWithMeilisearch;
    use OperateursPlateforme;
    use RefreshDatabase;
    use SocleIaDEssai;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);
        Cache::forget(SearchAliasCurator::SIGNATURE_KEY);
        SearchAlias::forgetCaches();

        $dakar = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        GeoNeighborhood::factory()->create(['geo_city_id' => $dakar->id, 'name' => 'Ouakam', 'slug' => 'ouakam']);
        // Le passage part au nom de celui qui a allumé le réglage (revue adverse du 2026-11-04, 13a).
        $operator = $this->operateur(PlatformProfileLevel::SuperAdmin);
        SearchAliasSetting::current()->forceFill(['enabled' => true, 'operator_id' => $operator->id, 'enabled_at' => now()])->save();

        foreach (['appartement wakam', 'aprt clime'] as $q) {
            SearchQueryStat::query()->create([
                'day' => now()->toDateString(), 'query_key' => hash('sha256', $q), 'normalized_query' => $q, 'criteria' => [],
                'searches_count' => 3, 'distinct_visitors' => 3, 'zero_results_count' => 3, 'last_results_count' => 0,
            ]);
        }
        SearchAliasProposals::fake(fn () => ['aliases' => [
            ['alias' => 'wakam', 'target_kind' => 'neighborhood', 'target_value' => 'Ouakam', 'target_city' => 'Dakar', 'confidence' => 0.95],
            ['alias' => 'aprt', 'target_kind' => 'property_type', 'target_value' => 'apartment', 'target_city' => null, 'confidence' => 0.9],
            ['alias' => 'clime', 'target_kind' => 'term', 'target_value' => 'climatisation', 'target_city' => null, 'confidence' => 0.9],
        ]]);
    }

    private function parse(string $q): array
    {
        return app(SearchQueryParser::class)->parse($q, 'fr')->criteria;
    }

    public function test_ac3_apres_le_passage_wakam_se_lit_ouakam_aprt_appartement_clime_climatisation(): void
    {
        $this->assertSame([], $this->parse('wakam'), 'avant : rien de compris');

        $this->assertSame(3, app(SearchAliasCurator::class)->run()['created']);

        $this->assertSame(['city' => 'Dakar', 'location' => 'Ouakam'], $this->parse('wakam'));
        $this->assertSame(['type' => 'apartment', 'city' => 'Dakar', 'location' => 'Ouakam', 'tags' => 'Climatisation'], $this->parse('aprt clime wakam'));
    }

    public function test_ac3_la_variante_active_est_trouvee_dans_l_index_des_suggestions(): void
    {
        $this->publishedIn('Dakar', 'Ouakam', ['title' => 'Appartement avec climatisation']);
        $this->indexProperties();
        app(SearchAliasCurator::class)->run();

        $this->buildSuggestions();

        $documents = collect($this->suggestionDocuments());
        // Un lieu : par le lexique des lieux (`referentialNames()`) ET par `withAliases()` ; un type et un terme : par
        // `withAliases()` seul.
        $this->assertContains('wakam', $documents->firstWhere('value', 'Ouakam')['aliases']);
        $this->assertContains('aprt', $documents->firstWhere('value', 'apartment')['aliases']);
        $clime = $documents->firstWhere('label_fr', 'clime');
        $this->assertSame(['alias', 'climatisation'], [$clime['kind'] ?? null, $clime['value'] ?? null]);
        $data = $this->getJson('/api/search/suggest?q=wakam')->assertOk()->json('data');
        $this->assertSame(['city' => 'Dakar', 'location' => 'Ouakam'], $data['interpretation']['criteria']);
        $this->assertSame(1, $data['interpretation']['count']);
        $this->assertContains('Ouakam', array_column($data['places'], 'label'));
    }

    public function test_une_variante_rejetee_n_est_plus_comprise(): void
    {
        app(SearchAliasCurator::class)->run();
        $this->assertSame(['city' => 'Dakar', 'location' => 'Ouakam'], $this->parse('wakam'));

        SearchAlias::query()->where('alias', 'wakam')->update(['status' => SearchAliasStatus::Rejected->value]);
        SearchAlias::forgetCaches();

        $this->assertSame([], $this->parse('wakam'));
    }

    public function test_une_variante_dont_le_lieu_a_disparu_ne_designe_plus_rien(): void
    {
        app(SearchAliasCurator::class)->run();
        GeoNeighborhood::query()->where('name', 'Ouakam')->delete();
        SearchAlias::forgetCaches();

        $this->assertSame([], $this->parse('wakam'));
    }
}
