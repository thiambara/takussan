<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarCrawlDiscovery;
use App\Models\RadarCrawlSource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2467 (ADR-0087 §4) — le réglage de la découverte d'une source (`discovery`), par `PATCH …/crawl/sources/{site}`
 * (`platform.radar.publish`), et ce que la console en lit.
 */
class RadarCrawlDiscoveryApiTest extends TestCase
{
    use OperateursPlateforme, RefreshDatabase;

    public function test_la_console_lit_la_decouverte_effective_de_chaque_source(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $data = collect($this->getJson('/api/admin/radar/crawl/sources')->assertOk()->json('data'))->keyBy('site');

        $this->assertSame('sitemap', $data['expat_dakar']['discovery']);
        $this->assertTrue($data['expat_dakar']['sitemap_available']);
        $this->assertSame('lists', $data['coinafrique']['discovery']);
        $this->assertFalse($data['coinafrique']['sitemap_available']);
    }

    public function test_le_porteur_regle_la_decouverte_et_null_rend_le_defaut(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->patchJson('/api/admin/radar/crawl/sources/expat_dakar', ['discovery' => 'lists'])
            ->assertOk()
            ->assertJsonPath('data.discovery', 'lists');
        $this->assertSame(RadarCrawlDiscovery::Lists, RadarCrawlSource::query()->where('site', 'expat_dakar')->sole()->discovery);

        $this->patchJson('/api/admin/radar/crawl/sources/expat_dakar', ['discovery' => null])
            ->assertOk()
            ->assertJsonPath('data.discovery', 'sitemap');
        $this->assertNull(RadarCrawlSource::query()->where('site', 'expat_dakar')->sole()->discovery);
    }

    public function test_un_sitemap_sur_un_site_qui_n_en_declare_pas_ou_une_valeur_inconnue_sont_refuses(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->patchJson('/api/admin/radar/crawl/sources/coinafrique', ['discovery' => 'sitemap'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'radar.crawl.discovery_unavailable');
        $this->patchJson('/api/admin/radar/crawl/sources/expat_dakar', ['discovery' => 'rss'])->assertUnprocessable();
        $this->assertSame(0, RadarCrawlSource::query()->whereNotNull('discovery')->count());
    }

    public function test_le_support_ne_regle_pas_la_decouverte(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->patchJson('/api/admin/radar/crawl/sources/expat_dakar', ['discovery' => 'lists'])->assertForbidden();
    }
}
