<?php

namespace Tests\Feature\Search;

use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Laravel\Scout\EngineManager;
use Meilisearch\Client;
use Meilisearch\Endpoints\Indexes;
use Mockery;
use Tests\Support\TestSearchIndex;
use Tests\TestCase;

/**
 * TCK-995 (P52.01, P52.02, P52.04) — `search:sync-index-settings` échoue vraiment, attend ses
 * tâches et relit ce que l'index applique.
 *
 * Les index visés sont ceux de CE processus (`testing_<jeton>_…`), supprimés à son extinction.
 */
class SearchSyncIndexSettingsTest extends TestCase
{
    use RefreshDatabase;

    private function client(): Client
    {
        return new Client(config('scout.meilisearch.host'), config('scout.meilisearch.key'));
    }

    /** Les index déclarés ici, sous le préfixe de ce processus. */
    private function declarer(array $index): void
    {
        config(['scout.meilisearch.index-settings' => $index]);
    }

    private function uid(string $nom): string
    {
        return TestSearchIndex::prefix().$nom;
    }

    private function hoteInjoignable(): void
    {
        config(['scout.meilisearch.host' => 'http://127.0.0.1:9']);
        $this->app->forgetInstance(Client::class);
        $this->app->forgetInstance(EngineManager::class);
    }

    public function test_meilisearch_injoignable_fait_sortir_la_commande_en_echec_quand_celle_de_scout_sort_en_zero(): void
    {
        $this->declarer(['essai_a' => ['filterableAttributes' => ['x']], 'essai_b' => ['sortableAttributes' => ['y']]]);
        $this->hoteInjoignable();

        $this->assertSame(0, Artisan::call('scout:sync-index-settings'), 'le défaut de Scout que P52.01 a mesuré');

        $this->assertSame(1, Artisan::call('search:sync-index-settings'));
        $sortie = Artisan::output();
        $this->assertStringContainsString($this->uid('essai_a'), $sortie);
        $this->assertStringContainsString($this->uid('essai_b'), $sortie, 'le premier échec n\'abandonne pas les index suivants');
    }

    public function test_un_reglage_refuse_n_empeche_pas_les_autres_index(): void
    {
        $this->declarer([
            'essai_refus' => ['filterableAttributes' => [['attributePatterns' => ['x'], 'features' => ['facetSearch' => 'oui']]]],
            'essai_ok' => ['filterableAttributes' => ['statut'], 'pagination' => ['maxTotalHits' => 4321]],
        ]);

        $this->assertSame(1, Artisan::call('search:sync-index-settings'));
        $this->assertStringContainsString($this->uid('essai_refus'), Artisan::output());

        $this->assertSame(['statut'], $this->client()->index($this->uid('essai_ok'))->getFilterableAttributes());
        $this->assertSame(4321, $this->client()->index($this->uid('essai_ok'))->getPagination()['maxTotalHits']);
    }

    public function test_un_reglage_retire_de_la_configuration_revient_a_son_defaut(): void
    {
        $uid = $this->uid('essai_retrait');
        $client = $this->client();
        $tache = $client->index($uid)->updateSettings(['typoTolerance' => ['enabled' => false], 'filterableAttributes' => ['ancien']]);
        $client->waitForTask($tache['taskUid'], 10000);

        $this->declarer(['essai_retrait' => ['sortableAttributes' => ['prix']]]);

        $this->assertSame(0, Artisan::call('search:sync-index-settings'), Artisan::output());
        $reglages = $client->index($uid)->getSettings();
        $this->assertTrue($reglages['typoTolerance']['enabled']);
        $this->assertSame([], $reglages['filterableAttributes']);
        $this->assertSame(['prix'], $reglages['sortableAttributes']);
    }

    public function test_les_index_des_modeles_sont_synchronises_et_relus(): void
    {
        $this->assertSame(0, Artisan::call('search:sync-index-settings'), Artisan::output());

        $declare = config('scout.meilisearch.index-settings')[Property::class]['sortableAttributes'];
        $applique = $this->client()->index((new Property)->indexableAs())->getSortableAttributes();
        sort($declare);
        sort($applique);
        $this->assertSame($declare, $applique);
    }

    public function test_une_tache_echouee_fait_sortir_la_commande_en_echec(): void
    {
        $this->declarer(['essai_tache' => ['sortableAttributes' => ['prix']]]);
        $this->clientSimule(
            tache: ['status' => 'failed', 'error' => ['message' => 'réglage rejeté par le moteur']],
            relus: ['sortableAttributes' => ['prix']],
        );

        $this->assertSame(1, Artisan::call('search:sync-index-settings'));
        $this->assertStringContainsString('réglage rejeté par le moteur', Artisan::output());
    }

    public function test_des_reglages_relus_differents_du_declare_font_sortir_la_commande_en_echec(): void
    {
        $this->declarer(['essai_relu' => ['sortableAttributes' => ['prix', 'ranked_at']]]);
        $this->clientSimule(tache: ['status' => 'succeeded'], relus: ['sortableAttributes' => ['prix']]);

        $this->assertSame(1, Artisan::call('search:sync-index-settings'));
        $this->assertStringContainsString('ranked_at', Artisan::output());
    }

    public function test_hors_meilisearch_la_commande_refuse(): void
    {
        config(['scout.driver' => 'collection']);

        $this->assertSame(1, Artisan::call('search:sync-index-settings'));
    }

    /** Un client dont la tâche rend `$tache` et dont les réglages relus valent `$relus`. */
    private function clientSimule(array $tache, array $relus): void
    {
        $index = Mockery::mock(Indexes::class);
        $index->shouldReceive('getSettings')->andReturn([], $relus);
        $index->shouldReceive('updateSettings')->andReturn(['taskUid' => 42]);

        $client = Mockery::mock(Client::class);
        $client->shouldReceive('index')->andReturn($index);
        $client->shouldReceive('waitForTask')->with(42, Mockery::any())->andReturn(['uid' => 42] + $tache);

        $this->app->instance(Client::class, $client);
    }
}
