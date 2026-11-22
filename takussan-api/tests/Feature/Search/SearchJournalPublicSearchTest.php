<?php

namespace Tests\Feature\Search;

use App\Models\Property;
use App\Models\SearchQueryStat;
use Illuminate\Contracts\Http\Kernel as HttpKernel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2472 (ADR-0088 §3) — la recherche publique des biens est le seul point d'écriture du journal : la page 1 d'une
 * recherche validée, après la réponse. Ni la page 2, ni la rangée « À vendre » de l'accueil (`placements=false`), ni la
 * route des suggestions.
 */
class SearchJournalPublicSearchTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Property::factory()->count(3)->published()->create(['contract_type' => 'rent']);
        $this->indexProperties();
    }

    public function test_une_recherche_publique_page_1_ecrit_une_ligne_et_la_page_2_non(): void
    {
        $this->chercher('q=&contract_type=rent&per_page=2')->assertOk()->assertJsonPath('meta.total', 3);

        $ligne = SearchQueryStat::query()->sole();
        $this->assertSame(['contract_type' => 'rent'], $ligne->criteria);
        $this->assertNull($ligne->normalized_query);
        $this->assertSame(1, $ligne->searches_count);
        $this->assertSame(1, $ligne->distinct_visitors);
        $this->assertSame(3, $ligne->last_results_count);

        $this->chercher('contract_type=rent&per_page=2&page=2')->assertOk()->assertJsonPath('meta.current_page', 2);
        $this->assertSame(1, SearchQueryStat::query()->sole()->searches_count, 'la page 2 n’écrit rien');
    }

    public function test_la_ligne_s_ecrit_apres_la_reponse(): void
    {
        $kernel = $this->app->make(HttpKernel::class);
        $request = Request::create('/api/public/properties/search?q=villa', 'GET', server: [
            'REMOTE_ADDR' => '198.51.100.5', 'HTTP_ACCEPT' => 'application/json',
        ]);

        $response = $kernel->handle($request);
        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(0, SearchQueryStat::query()->count(), 'rien tant que la réponse n’est pas partie');

        $kernel->terminate($request, $response);
        $this->assertSame('villa', SearchQueryStat::query()->sole()->normalized_query);
    }

    public function test_une_recherche_sans_resultat_est_comptee(): void
    {
        $this->chercher('q=chateau&contract_type=sale')->assertOk()->assertJsonPath('meta.total', 0);

        $ligne = SearchQueryStat::query()->sole();
        $this->assertSame('chateau', $ligne->normalized_query);
        $this->assertSame(1, $ligne->zero_results_count);
    }

    /** Une recherche servie par le repli élargi (ADR-0024) n'a rien trouvé telle quelle : comptée sans résultat. */
    public function test_une_recherche_elargie_est_comptee_sans_resultat(): void
    {
        Property::factory()->published()->create(['title' => 'Villa Portudal bord de mer', 'contract_type' => 'sale']);
        $this->indexProperties();

        $this->chercher('q='.rawurlencode('portudal zorglubique'))->assertOk()
            ->assertJsonPath('search.strategy', 'widened')
            ->assertJsonPath('meta.total', 1);

        $ligne = SearchQueryStat::query()->sole();
        $this->assertSame(0, $ligne->last_results_count);
        $this->assertSame(1, $ligne->zero_results_count);
    }

    /** AC1, par la route — une saisie avec un numéro n'écrit aucune ligne. */
    public function test_une_saisie_avec_un_numero_n_ecrit_aucune_ligne(): void
    {
        $this->chercher('q='.rawurlencode('appart 77 123 45 67'))->assertOk();

        $this->assertSame(0, DB::table('search_query_stats')->count());
        $this->assertSame(0, DB::table('search_query_visitors')->count());
    }

    public function test_la_rangee_de_l_accueil_et_la_suggestion_n_ecrivent_rien(): void
    {
        $this->chercher('contract_type=rent&per_page=6&placements=false')->assertOk();
        $this->getJson('/api/search/suggest?q=villa')->assertOk();

        $this->assertSame(0, SearchQueryStat::query()->count());
    }

    private function chercher(string $query): TestResponse
    {
        return $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.4'])
            ->withHeader('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36')
            ->getJson('/api/public/properties/search?'.$query);
    }
}
