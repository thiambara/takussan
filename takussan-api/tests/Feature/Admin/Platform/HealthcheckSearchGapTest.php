<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Services\Admin\HealthcheckService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2457 — la tuile Santé `search` compare l'index des biens au prédicat d'INDEXATION (`Property::indexable()`),
 * contre un Meilisearch réel. Classe à part de `HealthcheckProbesTest` : `InteractsWithMeilisearch` rallume Scout et
 * purge les index à chaque test, ce dont les autres sondes n'ont pas besoin.
 *
 * Le corpus porte PLUS de biens `is_test` et vendus que `SEARCH_GAP_TOLERANCE` : comptée contre `public()`, la sonde
 * serait dégradée sur un index pourtant aligné — c'est le défaut mesuré en préproduction (gap = −476).
 */
class HealthcheckSearchGapTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['scout.driver' => 'meilisearch']);

        $tolerance = HealthcheckService::SEARCH_GAP_TOLERANCE;
        Property::factory()->published()->count(3)->create();
        Property::factory()->published()->count($tolerance)->create(['is_test' => true]);
        Property::factory()->published()->count($tolerance)->create(['status' => PropertyStatus::Sold]);
        // Hors index : la sonde ne doit pas les attendre.
        Property::factory()->count(2)->create(['status' => PropertyStatus::Draft, 'published_at' => null]);
        $this->indexProperties();
    }

    /**
     * L'index survit au `ROLLBACK` de `RefreshDatabase`, et `InteractsWithMeilisearch` ne le purge qu'au DÉBUT d'un test
     * qui le porte : laissés là, ces 23 documents rendaient la tuile `search` dégradée (base vide, gap −23) pour la
     * classe suivante du même processus — `HealthcheckProbesTest`, qui attend un statut global `ok`, a rougi ainsi.
     */
    protected function tearDown(): void
    {
        try {
            Property::removeAllFromSearch();
            $this->waitForMeilisearch();
        } finally {
            parent::tearDown();
        }
    }

    /** @return array<string, mixed> */
    private function sonde(): array
    {
        return app(HealthcheckService::class)->refresh()['search'];
    }

    public function test_un_index_aligne_sur_indexable_n_est_pas_degrade_malgre_les_biens_de_test_et_vendus(): void
    {
        $attendu = 3 + 2 * HealthcheckService::SEARCH_GAP_TOLERANCE;
        $this->assertSame($attendu, Property::query()->indexable()->count());
        $this->assertGreaterThan(HealthcheckService::SEARCH_GAP_TOLERANCE, $attendu - Property::query()->public()->count(),
            'le corpus doit rendre la sonde dégradée si elle comptait public()');

        $sonde = $this->sonde();

        $this->assertSame($attendu, $sonde['documents'], 'les biens de test et vendus sont bien dans l\'index');
        $this->assertSame($attendu, $sonde['expected']);
        $this->assertSame(0, $sonde['gap']);
        $this->assertSame('ok', $sonde['status']);
    }

    public function test_un_index_qui_a_decroche_au_dela_de_la_tolerance_degrade_la_tuile(): void
    {
        $retires = HealthcheckService::SEARCH_GAP_TOLERANCE + 1;
        $ids = Property::query()->indexable()->orderBy('id')->limit($retires)->pluck('id')->all();
        $this->meilisearchClient()->index((new Property)->searchableAs())->deleteDocuments($ids);
        $this->waitForMeilisearch();

        $sonde = $this->sonde();

        $this->assertSame($retires, $sonde['gap']);
        $this->assertSame('degraded', $sonde['status']);
    }

    public function test_un_ecart_dans_la_tolerance_n_est_pas_degrade(): void
    {
        $retires = HealthcheckService::SEARCH_GAP_TOLERANCE;
        $ids = Property::query()->indexable()->orderBy('id')->limit($retires)->pluck('id')->all();
        $this->meilisearchClient()->index((new Property)->searchableAs())->deleteDocuments($ids);
        $this->waitForMeilisearch();

        $sonde = $this->sonde();

        $this->assertSame($retires, $sonde['gap']);
        $this->assertSame('ok', $sonde['status']);
    }
}
