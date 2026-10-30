<?php

namespace Tests\Feature\Radar\Observatory;

use App\Jobs\Radar\ExtractRadarListing;
use App\Jobs\SendAdminAlert;
use App\Models\AlertRule;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceSite;
use App\Models\Property;
use App\Models\RadarCrawlRun;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Radar\Crawl\RadarCrawlScheduler;
use App\Services\Radar\Crawl\RadarCrawlSources;
use App\Services\Radar\HostResolver;
use App\Services\Radar\Observatory\RadarSourceWatch;
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
 * TCK-2393 (AC2, AC3) — de bout en bout, sur le VRAI passage de collecte de TCK-2392 : ses horodatages (`started_at`,
 * `last_seen_at`) et son `reached_end` sont ceux que `RadarSourceWatch` suppose. Pages de liste écrites à la main
 * (`tests/fixtures/radar/crawl/`, données inventées), aucun réseau. La disparition se conclut de deux passages complets
 * d'affilée (`radar.observe.confirm_runs`).
 */
class RadarSourceWatchCrawlTest extends TestCase
{
    use OperateursPlateforme, RefreshDatabase;

    private const LIST = 'https://www.expat-dakar.com/immobilier';

    private const STUDIO = 'https://www.expat-dakar.com/annonce/studio-fictif-plateau-9000004';

    private User $operator;

    /** @var array<string, string> URL → corps servi */
    private array $pages = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeSecond();
        Sleep::fake(syncWithCarbon: true);
        Cache::flush();
        Http::preventStrayRequests();
        Bus::fake([ExtractRadarListing::class, SendAdminAlert::class]);

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
        ];
        Http::fake(function (Request $request) {
            if (str_ends_with(parse_url($request->url(), PHP_URL_PATH) ?? '', '/robots.txt')) {
                return Http::response("User-agent: *\nDisallow: /compte/\n", 200, ['Content-Type' => 'text/plain']);
            }

            return isset($this->pages[$request->url()])
                ? Http::response($this->pages[$request->url()], 200, ['Content-Type' => 'text/html; charset=utf-8'])
                : Http::response('introuvable', 404, ['Content-Type' => 'text/html']);
        });

        $this->operator = $this->operateur(PlatformProfileLevel::SuperAdmin);
        AlertRule::create([
            'event' => RadarSourceWatch::EVENT,
            'channels_json' => ['email'],
            'recipients_json' => ['emails' => ['ops@example.test']],
            'is_active' => true,
        ]);
    }

    private function fixture(string $name): string
    {
        return (string) file_get_contents(base_path('tests/fixtures/radar/crawl/'.$name));
    }

    private function crawl(): RadarCrawlRun
    {
        $run = $this->app->make(RadarCrawlScheduler::class)->startManually(RadarSourceSite::ExpatDakar, $this->operator);
        $this->assertNotNull($run);

        return $run->fresh();
    }

    /** Le studio de la dernière page est publié ; un second passage lit la liste jusqu'au bout et ne le trouve plus. */
    private function publierLeStudioPuisLeRetirerDeLaListe(): RadarListing
    {
        $premier = $this->crawl();
        $this->assertTrue($premier->reached_end);
        $studio = RadarListing::query()->where('content_fingerprint', RadarListingIntake::urlFingerprint(self::STUDIO))->sole();
        $studio->forceFill(['stage' => RadarListingStage::Published, 'property_id' => Property::factory()->published()->create()->id])->save();

        // Une heure plus tard, la dernière page montre une autre annonce : le studio est parti.
        $this->travel(1)->hours();
        $this->pages[self::LIST.'?page=2'] = str_replace(['studio-fictif-plateau-9000004', 'Studio fictif au Plateau'], ['studio-fictif-fann-9000099', 'Studio fictif à Fann'], $this->pages[self::LIST.'?page=2']);

        return $studio;
    }

    /** AC2 — après deux passages qui ont lu toute la liste sans le revoir, le studio publié a disparu, et le bien alerte. */
    public function test_deux_passages_complets_sans_l_annonce_publiee_alertent_sur_son_bien(): void
    {
        $studio = $this->publierLeStudioPuisLeRetirerDeLaListe();
        $this->assertTrue($this->crawl()->reached_end);
        $this->assertSame(['gone' => 0, 'back' => 0, 'alerts' => 0], app(RadarSourceWatch::class)->observe());

        $this->travel(1)->hours();
        $troisieme = $this->crawl();
        $this->assertTrue($troisieme->reached_end);

        $this->assertSame(['gone' => 1, 'back' => 0, 'alerts' => 1], app(RadarSourceWatch::class)->observe());
        $this->assertSame($troisieme->id, $studio->refresh()->source_gone_run_id);
        Bus::assertDispatched(SendAdminAlert::class, fn (SendAdminAlert $job) => (int) $job->alert['subject_id'] === $studio->id);
    }

    /** AC3 — un passage arrêté au plafond de pages n'a pas lu la page du studio : il n'est pas le second passage complet. */
    public function test_un_passage_arrete_au_plafond_ne_conclut_rien(): void
    {
        $studio = $this->publierLeStudioPuisLeRetirerDeLaListe();
        $this->assertTrue($this->crawl()->reached_end);

        $this->travel(1)->hours();
        $this->app->make(RadarCrawlSources::class)->find(RadarSourceSite::ExpatDakar->value)->fill(['max_pages' => 1])->save();
        $plafonne = $this->crawl();
        $this->assertFalse($plafonne->reached_end);

        $this->assertSame(['gone' => 0, 'back' => 0, 'alerts' => 0], app(RadarSourceWatch::class)->observe());
        $this->assertNull($studio->refresh()->source_gone_at);
        Bus::assertNotDispatched(SendAdminAlert::class);
    }

    /**
     * I1 (vérification adverse, son banc) — le glissement de pagination. Entre la lecture de la page 1 et celle de la page 2,
     * une annonce de la page 1 est retirée : le studio remonte en page 1, déjà lue, et le passage atteint la fin sans l'avoir
     * vu. Le studio n'a jamais quitté le site : trois glissements alternés avec des passages stables n'alertent jamais.
     */
    public function test_un_glissement_de_pagination_n_alerte_pas(): void
    {
        $studio = $this->carte('studio-fictif-plateau-9000004', 'Studio fictif au Plateau');
        $chambre = $this->carte('chambre-fictive-fann-9000005', 'Chambre fictive à Fann');
        $this->pages[self::LIST.'?page=2'] = $this->page2([$studio, $chambre]);
        $this->assertTrue($this->crawl()->reached_end);
        $annonce = RadarListing::query()->where('content_fingerprint', RadarListingIntake::urlFingerprint(self::STUDIO))->sole();
        $annonce->forceFill(['stage' => RadarListingStage::Published, 'property_id' => Property::factory()->published()->create()->id])->save();

        foreach ([[$chambre], [$studio, $chambre], [$chambre], [$studio, $chambre], [$chambre]] as $page2) {
            $this->travel(1)->hours();
            $this->pages[self::LIST.'?page=2'] = $this->page2($page2);
            $this->assertTrue($this->crawl()->reached_end);
            $this->assertSame(0, app(RadarSourceWatch::class)->observe()['gone']);
        }

        $this->assertNull($annonce->refresh()->source_gone_at);
        Bus::assertNotDispatched(SendAdminAlert::class);
    }

    private function carte(string $slug, string $titre): string
    {
        return '<div class="tw-sr-results__item"><article class="tw-sr-card tw-sr-card--default"><div class="tw-sr-card__body">'
            .'<h2 class="tw-sr-card__title"><a href="https://www.expat-dakar.com/annonce/'.$slug.'" class="tw-sr-card__title-link"'
            .' data-t-listing_category_slug="appartements-a-louer" data-t-listing_price="200000.00" data-t-listing_currency="XOF"'
            .' data-t-listing_location_title="Plateau, Dakar">'.$titre.'</a></h2></div></article></div>';
    }

    /** @param  list<string>  $cartes */
    private function page2(array $cartes): string
    {
        return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>p2</title><link rel="prev" href="'.self::LIST.'"></head>'
            .'<body><div class="tw-sr-results">'.implode('', $cartes).'</div></body></html>';
    }
}
