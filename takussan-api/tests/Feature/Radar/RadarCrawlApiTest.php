<?php

namespace Tests\Feature\Radar;

use App\Jobs\Radar\CrawlRadarSource;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\RadarCrawlRun;
use App\Models\RadarCrawlSource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2392 (AC4) — l'onglet Collecte : lire les sites et leurs passages (`platform.radar.operate`), les allumer, régler leur
 * fréquence et lancer un passage (`platform.radar.publish`, `super_admin` seul). Aucun passage n'est exécuté ici : la file
 * est doublée, seul ce que la console déclenche est vérifié.
 */
class RadarCrawlApiTest extends TestCase
{
    use OperateursPlateforme, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->freezeSecond();
        Queue::fake();
    }

    public function test_les_sites_configures_se_lisent_eteints_tant_que_le_porteur_ne_les_allume_pas(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $data = $this->getJson('/api/admin/radar/crawl/sources?fields[radar_crawl_sources]=id,site,enabled,frequency_minutes,max_pages')
            ->assertOk()
            ->json('data');

        $this->assertSame(['expat_dakar', 'coinafrique'], array_column($data, 'site'));
        $this->assertSame([false, false], array_column($data, 'enabled'));
        $this->assertSame([360, 360], array_column($data, 'frequency_minutes'));
        $this->assertArrayNotHasKey('operator_id', $data[0], 'Une colonne non demandée est omise.');
    }

    public function test_le_support_lit_les_passages_mais_ne_regle_ni_ne_lance_rien(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->getJson('/api/admin/radar/crawl/runs?fields[radar_crawl_runs]=id,site,status')->assertOk();

        $this->patchJson('/api/admin/radar/crawl/sources/expat_dakar', ['enabled' => true])->assertForbidden();
        $this->postJson('/api/admin/radar/crawl/sources/expat_dakar/run')->assertForbidden();
        $this->assertFalse((bool) RadarCrawlSource::query()->where('site', 'expat_dakar')->value('enabled'));
        Queue::assertNothingPushed();
    }

    public function test_allumer_une_source_en_fait_l_operateur_de_celui_qui_l_allume(): void
    {
        $porteur = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->patchJson('/api/admin/radar/crawl/sources/coinafrique?include=operator', ['enabled' => true, 'frequency_minutes' => 720, 'max_pages' => 3])
            ->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.operator.id', $porteur->id);

        $source = RadarCrawlSource::query()->where('site', 'coinafrique')->firstOrFail();
        $this->assertSame($porteur->id, $source->operator_id);
        $this->assertTrue($source->enabled_at->equalTo(now()));
        $this->assertSame(720, $source->frequency_minutes);
        $this->assertSame(3, $source->max_pages);
        $this->assertDatabaseHas('activity_log', ['event' => 'radar_crawl_source_updated', 'causer_id' => $porteur->id]);

        // La lecture de la console, telle que le front la demande : l'opérateur par `include`, sous ses propres colonnes.
        $lu = $this->getJson('/api/admin/radar/crawl/sources?include=operator'
            .'&fields[radar_crawl_sources]=id,site,enabled,operator_id&fields[users]=id,first_name,last_name,username')
            ->assertOk()
            ->json('data');
        $this->assertSame($porteur->nameWithoutContact(), $lu[1]['operator']['name']);
        $this->assertNull($lu[0]['operator']);

        $this->patchJson('/api/admin/radar/crawl/sources/coinafrique', ['enabled' => false])->assertOk()->assertJsonPath('data.enabled', false);
        $this->assertFalse($source->fresh()->enabled);
    }

    public function test_la_frequence_et_les_pages_sont_bornees(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->patchJson('/api/admin/radar/crawl/sources/coinafrique', ['frequency_minutes' => 59])->assertUnprocessable();
        $this->patchJson('/api/admin/radar/crawl/sources/coinafrique', ['frequency_minutes' => 10_081])->assertUnprocessable();
        $this->patchJson('/api/admin/radar/crawl/sources/coinafrique', ['max_pages' => 21])->assertUnprocessable();
        $this->patchJson('/api/admin/radar/crawl/sources/facebook', ['enabled' => true])
            ->assertNotFound()
            ->assertJsonPath('code', 'radar.crawl.unknown_site');
    }

    public function test_un_passage_manuel_part_en_file_et_un_second_est_refuse_tant_que_le_premier_est_actif(): void
    {
        $porteur = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $id = $this->postJson('/api/admin/radar/crawl/sources/expat_dakar/run')
            ->assertStatus(202)
            ->assertJsonPath('data.status', 'queued')
            ->assertJsonPath('data.trigger', 'manual')
            ->json('data.id');
        Queue::assertPushed(CrawlRadarSource::class, 1);
        $this->assertSame($porteur->id, RadarCrawlRun::query()->findOrFail($id)->operator_id);

        $this->postJson('/api/admin/radar/crawl/sources/expat_dakar/run')
            ->assertStatus(409)
            ->assertJsonPath('code', 'radar.crawl.active');
        $this->assertSame(1, RadarCrawlRun::query()->count());
    }
}
