<?php

namespace Tests\Feature\Radar;

use App\Jobs\Radar\ExtractRadarListing;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarSourceSite;
use App\Models\RadarCrawlRun;
use App\Models\RadarCrawlSource;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Radar\Crawl\RadarCrawlScheduler;
use App\Services\Radar\Crawl\RadarCrawlSources;
use App\Services\Radar\HostResolver;
use App\Services\Radar\RadarListingIntake;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2438 (ADR-0080, amendement du 2026-10-30) — les URL de départ de la collecte, réglées dans la console : le réglage
 * et ses garde-fous (AC1, AC3, AC5), puis le passage qui lit chaque liste dans le budget du passage entier (AC1, AC2, AC4).
 *
 * Aucun réseau : `Http::preventStrayRequests()`, un résolveur DNS doublé, des pages de liste écrites à la main (la fixture
 * de TCK-2392 pour `/immobilier`, les autres construites ici, données inventées). Le temps est figé.
 */
class RadarCrawlStartUrlsTest extends TestCase
{
    use OperateursPlateforme, RefreshDatabase;

    private const LIST = 'https://www.expat-dakar.com/immobilier';

    private const APPARTEMENTS = 'https://www.expat-dakar.com/appartements-a-louer?ville=dakar';

    private const TERRAINS = 'https://expat-dakar.com/terrains-a-vendre';

    private User $operator;

    /** @var array<string, string> URL → corps servi */
    private array $pages = [];

    private string $robots = "User-agent: *\nDisallow: /compte/\n";

    protected function setUp(): void
    {
        parent::setUp();

        $this->freezeSecond();
        Sleep::fake(syncWithCarbon: true);
        Cache::flush();
        Http::preventStrayRequests();
        Bus::fake([ExtractRadarListing::class]);

        $this->app->instance(HostResolver::class, new class implements HostResolver
        {
            public function resolve(string $host): array
            {
                return ['93.184.216.34'];
            }
        });

        $this->pages = [
            self::LIST => $this->fixture('expat-dakar-page-1.html'),
            self::LIST.'?page=2' => $this->fixture('expat-dakar-page-2.html'),
            self::APPARTEMENTS => $this->page([$this->carte('appartement-fictif-ouakam-9100001')], self::APPARTEMENTS.'&page=2'),
            self::APPARTEMENTS.'&page=2' => $this->page([$this->carte('appartement-fictif-yoff-9100002')]),
            self::TERRAINS => $this->page([$this->carte('terrain-fictif-diamniadio-9100003')]),
        ];
        Http::fake(function (Request $request) {
            if (str_ends_with(parse_url($request->url(), PHP_URL_PATH) ?? '', '/robots.txt')) {
                return Http::response($this->robots, 200, ['Content-Type' => 'text/plain']);
            }

            return isset($this->pages[$request->url()])
                ? Http::response($this->pages[$request->url()], 200, ['Content-Type' => 'text/html; charset=utf-8'])
                : Http::response('introuvable', 404, ['Content-Type' => 'text/html']);
        });

        $this->operator = $this->operateur(PlatformProfileLevel::SuperAdmin);
    }

    private function fixture(string $name): string
    {
        return (string) file_get_contents(base_path('tests/fixtures/radar/crawl/'.$name));
    }

    private function carte(string $slug): string
    {
        return '<div class="tw-sr-results__item"><article class="tw-sr-card tw-sr-card--default"><div class="tw-sr-card__body">'
            .'<h2 class="tw-sr-card__title"><a href="https://www.expat-dakar.com/annonce/'.$slug.'" class="tw-sr-card__title-link"'
            .' data-t-listing_category_slug="appartements-a-louer" data-t-listing_price="300000.00" data-t-listing_currency="XOF"'
            .' data-t-listing_location_title="Ouakam, Dakar">Annonce fictive '.$slug.'</a></h2></div></article></div>';
    }

    /** @param  list<string>  $cartes */
    private function page(array $cartes, ?string $next = null): string
    {
        $suivante = $next === null ? '' : '<link rel="next" href="'.htmlspecialchars($next).'">';

        return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>liste fictive</title>'.$suivante.'</head>'
            .'<body><div class="tw-sr-results">'.implode('', $cartes).'</div></body></html>';
    }

    private function source(): RadarCrawlSource
    {
        return $this->app->make(RadarCrawlSources::class)->find(RadarSourceSite::ExpatDakar->value);
    }

    /** @param  list<string>|null  $urls écrites telles quelles, sans passer par la console */
    private function regler(?array $urls, int $maxPages = 5): void
    {
        $this->source()->forceFill(['start_urls' => $urls, 'max_pages' => $maxPages])->save();
    }

    private function crawl(): RadarCrawlRun
    {
        $run = $this->app->make(RadarCrawlScheduler::class)->startManually(RadarSourceSite::ExpatDakar, $this->operator);
        $this->assertNotNull($run);

        return $run->fresh();
    }

    private function lue(string $url): bool
    {
        return Http::recorded(fn (Request $request) => $request->url() === $url)->isNotEmpty();
    }

    private function annonce(string $slug): ?RadarListing
    {
        return RadarListing::query()
            ->where('content_fingerprint', RadarListingIntake::urlFingerprint('https://www.expat-dakar.com/annonce/'.$slug))
            ->first();
    }

    // ── Le réglage (AC1, AC3, AC5) ────────────────────────────────────────────────────────────

    public function test_le_porteur_regle_plusieurs_urls_et_le_support_les_lit_sans_pouvoir_les_modifier(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->patchJson('/api/admin/radar/crawl/sources/expat_dakar', ['start_urls' => [' '.self::APPARTEMENTS.' ', self::TERRAINS, '']])
            ->assertOk()
            ->assertJsonPath('data.start_urls', [self::APPARTEMENTS, self::TERRAINS]);
        $this->assertSame([self::APPARTEMENTS, self::TERRAINS], $this->source()->start_urls);
        $this->assertDatabaseHas('activity_log', ['event' => 'radar_crawl_source_updated']);

        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $lu = $this->getJson('/api/admin/radar/crawl/sources?fields[radar_crawl_sources]=id,site,start_urls')->assertOk()->json('data');
        $this->assertSame([self::APPARTEMENTS, self::TERRAINS], $lu[0]['start_urls']);
        $this->assertSame(self::LIST, $lu[0]['default_start_url'], 'Le formulaire montre l\'URL de la configuration, le défaut.');
        $this->assertSame(['www.expat-dakar.com', 'expat-dakar.com'], $lu[0]['start_hosts']);
        $this->assertSame(['sn.coinafrique.com'], $lu[1]['start_hosts']);

        $this->patchJson('/api/admin/radar/crawl/sources/expat_dakar', ['start_urls' => [self::LIST]])->assertForbidden();
        $this->assertSame([self::APPARTEMENTS, self::TERRAINS], $this->source()->start_urls);
    }

    public function test_une_liste_vide_ou_nulle_rend_l_url_de_la_configuration(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        foreach ([[], null, ['  ']] as $vide) {
            $this->regler([self::APPARTEMENTS]);
            $this->patchJson('/api/admin/radar/crawl/sources/expat_dakar', ['start_urls' => $vide])
                ->assertOk()
                ->assertJsonPath('data.start_urls', null);
            $this->assertNull($this->source()->start_urls);
        }
    }

    public function test_les_garde_fous_refusent_l_url_et_rien_n_est_enregistre(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->app->make(RadarCrawlSources::class)->all();
        $long = 'https://www.expat-dakar.com/immobilier?q='.str_repeat('a', 500);
        $cas = [
            'http' => [['http://www.expat-dakar.com/immobilier'], 'radar.crawl.start_url_invalid'],
            'autre hôte' => [['https://evil.example/immobilier'], 'radar.crawl.start_url_host'],
            'sous-domaine non déclaré' => [['https://admin.expat-dakar.com/immobilier'], 'radar.crawl.start_url_host'],
            'suffixe' => [['https://www.expat-dakar.com.evil.example/immobilier'], 'radar.crawl.start_url_host'],
            'autre pays de CoinAfrique' => [['https://ci.coinafrique.com/categorie/immobilier'], 'radar.crawl.start_url_host'],
            'identifiants' => [['https://www.expat-dakar.com@evil.example/immobilier'], 'radar.crawl.start_url_invalid'],
            'identifiants sur le bon hôte' => [['https://user:pw@www.expat-dakar.com/immobilier'], 'radar.crawl.start_url_invalid'],
            'barre inverse' => [['https://www.expat-dakar.com\\@evil.example/'], 'radar.crawl.start_url_invalid'],
            'port' => [['https://www.expat-dakar.com:8443/immobilier'], 'radar.crawl.start_url_invalid'],
            'espace' => [['https://www.expat-dakar.com/immo bilier'], 'radar.crawl.start_url_invalid'],
            'javascript' => [['javascript:alert(1)'], 'radar.crawl.start_url_invalid'],
            'adresse IP' => [['https://93.184.216.34/immobilier'], 'radar.crawl.start_url_host'],
            'trop longue' => [[$long], 'radar.crawl.start_url_too_long'],
            'doublon' => [[self::APPARTEMENTS, self::TERRAINS, self::APPARTEMENTS], 'radar.crawl.start_url_duplicate'],
            'trop nombreuses' => [array_map(fn (int $i) => self::LIST.'?page='.$i, range(1, 11)), 'radar.crawl.start_urls_too_many'],
        ];

        foreach ($cas as $nom => [$urls, $code]) {
            $site = $nom === 'autre pays de CoinAfrique' ? 'coinafrique' : 'expat_dakar';
            $reponse = $this->patchJson("/api/admin/radar/crawl/sources/{$site}", ['start_urls' => $urls, 'max_pages' => 7])
                ->assertUnprocessable()
                ->assertJsonPath('code', $code);
            if ($code !== 'radar.crawl.start_urls_too_many') {
                $this->assertSame('start_urls.'.($nom === 'doublon' ? 2 : 0), $reponse->json('params.field'), $nom);
            }

            $source = RadarCrawlSource::query()->where('site', $site)->firstOrFail();
            $this->assertNull($source->start_urls, "Rien n'est enregistré ({$nom}).");
            $this->assertSame(5, $source->max_pages, "Les autres réglages de la même requête non plus ({$nom}).");
        }

        $this->patchJson('/api/admin/radar/crawl/sources/expat_dakar', ['start_urls' => ['https://evil.example/']])
            ->assertJsonPath('params.hosts', ['www.expat-dakar.com', 'expat-dakar.com']);
        // La borne exacte passe : dix URL, une de 500 caractères.
        $this->patchJson('/api/admin/radar/crawl/sources/expat_dakar', [
            'start_urls' => [...array_map(fn (int $i) => self::LIST.'?page='.$i, range(1, 9)), substr($long, 0, 500)],
        ])->assertOk();
        $this->assertCount(10, $this->source()->start_urls);
    }

    // ── Le passage (AC1, AC2, AC4) ────────────────────────────────────────────────────────────

    public function test_un_passage_lit_chaque_liste_et_sa_pagination_puis_atteint_la_fin(): void
    {
        $this->regler([self::APPARTEMENTS, self::TERRAINS]);

        $run = $this->crawl();

        $this->assertSame(RadarCrawlRun::STOP_END, $run->stop_reason);
        $this->assertTrue($run->reached_end, 'Chaque liste est allée jusqu\'au bout.');
        $this->assertSame(3, $run->pages_read);
        $this->assertSame(3, $run->listings_created);
        $this->assertSame([self::TERRAINS, self::APPARTEMENTS], $run->start_urls, 'Le passage note l\'ensemble trié des listes qu\'il a suivies.');
        foreach (['appartement-fictif-ouakam-9100001', 'appartement-fictif-yoff-9100002', 'terrain-fictif-diamniadio-9100003'] as $slug) {
            $this->assertNotNull($this->annonce($slug), $slug);
        }
        $this->assertFalse($this->lue(self::LIST), 'L\'URL de la configuration n\'est pas lue quand la console en règle.');
    }

    public function test_le_plafond_de_pages_vaut_pour_le_passage_entier(): void
    {
        $this->regler([self::APPARTEMENTS, self::TERRAINS], maxPages: 2);

        $run = $this->crawl();

        $this->assertSame(RadarCrawlRun::STOP_MAX_PAGES, $run->stop_reason);
        $this->assertSame(2, $run->pages_read);
        $this->assertFalse($run->reached_end);
        $this->assertFalse($this->lue(self::TERRAINS), 'La troisième page aurait dépassé le plafond du passage.');
    }

    public function test_une_liste_refusee_n_empeche_pas_la_suivante_mais_le_passage_n_atteint_pas_la_fin(): void
    {
        $this->robots = "User-agent: *\nDisallow: /appartements-a-louer\n";
        $this->regler([self::APPARTEMENTS, self::TERRAINS]);

        $run = $this->crawl();

        $this->assertSame('radar.fetch.robots', $run->stop_reason, 'L\'arrêt du passage est celui de la première liste qui n\'est pas allée au bout.');
        $this->assertFalse($run->reached_end);
        $this->assertSame(1, $run->pages_read);
        $this->assertNotNull($this->annonce('terrain-fictif-diamniadio-9100003'));
        $this->assertFalse($this->lue(self::APPARTEMENTS));
    }

    public function test_une_liste_deja_lue_par_la_pagination_d_une_autre_n_est_pas_relue(): void
    {
        $this->regler([self::LIST, self::LIST.'?page=2']);

        $run = $this->crawl();

        $this->assertSame(RadarCrawlRun::STOP_END, $run->stop_reason);
        $this->assertTrue($run->reached_end);
        $this->assertSame(2, $run->pages_read);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->url() === self::LIST.'?page=2'));
    }

    public function test_sans_url_reglee_le_passage_lit_l_url_de_la_configuration(): void
    {
        $this->regler(null);

        $run = $this->crawl();

        $this->assertTrue($run->reached_end);
        $this->assertSame([self::LIST], $run->start_urls, 'Le périmètre effectif : l\'URL de la configuration résolue, jamais nulle.');
        $this->assertTrue($this->lue(self::LIST));
        $this->assertFalse($this->lue(self::APPARTEMENTS));
    }

    public function test_une_url_ecrite_en_base_hors_de_la_console_n_est_jamais_lue(): void
    {
        $this->pages['https://evil.example/immobilier'] = $this->page([$this->carte('piege-9100009')]);
        $this->pages['http://www.expat-dakar.com/immobilier'] = $this->page([$this->carte('piege-9100010')]);
        $this->regler(['https://evil.example/immobilier', 'http://www.expat-dakar.com/immobilier', 'https://www.expat-dakar.com:8443/x', self::TERRAINS]);

        $run = $this->crawl();

        $this->assertSame([self::TERRAINS], $run->start_urls);
        $this->assertTrue($run->reached_end);
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'evil.example')
            || str_starts_with($request->url(), 'http://')
            || str_contains($request->url(), ':8443'));
        $this->assertNull($this->annonce('piege-9100009'));
    }

    public function test_si_aucune_url_reglee_ne_passe_le_passage_ne_lit_rien_et_ne_retombe_pas_sur_la_configuration(): void
    {
        $this->regler(['https://evil.example/immobilier']);

        $run = $this->crawl();

        $this->assertSame(RadarCrawlRun::STOP_NO_START_URL, $run->stop_reason);
        $this->assertSame(0, $run->pages_read);
        $this->assertFalse($run->reached_end);
        Http::assertNothingSent();
    }
}
