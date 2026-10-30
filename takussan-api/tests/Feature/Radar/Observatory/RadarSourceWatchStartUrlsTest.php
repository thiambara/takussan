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
 * TCK-2438 (AC6) — changer les URL de départ ne fait disparaître aucune annonce à tort. La veille (`RadarSourceWatch`) ne
 * compte un passage complet contre une annonce que si son périmètre (l'ensemble trié des listes suivies) CONTIENT celui du
 * passage qui l'a vue en dernier. Sans cela, restreindre le périmètre (« tout l'immobilier » → « appartements à louer »)
 * déclarerait disparue chaque annonce sortie du périmètre, avec une alerte et, pour un bien publié, la question à son
 * titulaire (TCK-2432). Élargir, en revanche, ne coupe pas la détection.
 *
 * Sur le vrai passage de TCK-2392, pages de liste écrites à la main, aucun réseau.
 */
class RadarSourceWatchStartUrlsTest extends TestCase
{
    use OperateursPlateforme, RefreshDatabase;

    private const LIST = 'https://www.expat-dakar.com/immobilier';

    private const APPARTEMENTS = 'https://www.expat-dakar.com/appartements-a-louer';

    private const STUDIO = 'https://www.expat-dakar.com/annonce/studio-fictif-plateau-9000004';

    private const OUAKAM = 'https://www.expat-dakar.com/annonce/appartement-fictif-ouakam-9100001';

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
            self::APPARTEMENTS => $this->page(['appartement-fictif-ouakam-9100001', 'appartement-fictif-yoff-9100002']),
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

    /** @param  list<string>  $slugs */
    private function page(array $slugs): string
    {
        $cartes = array_map(fn (string $slug) => '<div class="tw-sr-results__item"><article class="tw-sr-card tw-sr-card--default">'
            .'<div class="tw-sr-card__body"><h2 class="tw-sr-card__title"><a href="https://www.expat-dakar.com/annonce/'.$slug.'"'
            .' class="tw-sr-card__title-link" data-t-listing_category_slug="appartements-a-louer" data-t-listing_price="300000.00"'
            .' data-t-listing_currency="XOF" data-t-listing_location_title="Ouakam, Dakar">Annonce fictive</a></h2></div></article></div>', $slugs);

        return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>liste fictive</title></head>'
            .'<body><div class="tw-sr-results">'.implode('', $cartes).'</div></body></html>';
    }

    /** @param  list<string>|null  $urls */
    private function regler(?array $urls): void
    {
        $this->app->make(RadarCrawlSources::class)->find(RadarSourceSite::ExpatDakar->value)->forceFill(['start_urls' => $urls])->save();
    }

    private function crawl(): RadarCrawlRun
    {
        $this->travel(1)->hours();
        $run = $this->app->make(RadarCrawlScheduler::class)->startManually(RadarSourceSite::ExpatDakar, $this->operator);
        $this->assertNotNull($run);

        return $run->fresh();
    }

    private function publier(string $url): RadarListing
    {
        $listing = RadarListing::query()->where('content_fingerprint', RadarListingIntake::urlFingerprint($url))->sole();
        $listing->forceFill(['stage' => RadarListingStage::Published, 'property_id' => Property::factory()->published()->create()->id])->save();

        return $listing;
    }

    public function test_restreindre_les_urls_de_depart_ne_fait_disparaitre_aucune_annonce_ni_ne_questionne_le_titulaire(): void
    {
        $this->assertTrue($this->crawl()->reached_end);
        $studio = $this->publier(self::STUDIO);

        // Le porteur ne garde que les appartements à louer : le studio du Plateau n'est plus dans aucune liste lue.
        $this->regler([self::APPARTEMENTS]);
        $this->assertTrue($this->crawl()->reached_end);
        $this->assertTrue($this->crawl()->reached_end);
        $this->assertTrue($this->crawl()->reached_end);

        $this->assertSame(0, app(RadarSourceWatch::class)->observe()['gone']);
        $studio->refresh();
        $this->assertNull($studio->source_gone_at);
        $this->assertNull($studio->availability_asked_at, 'Aucune question au titulaire (TCK-2432).');
        Bus::assertNotDispatched(SendAdminAlert::class);
    }

    public function test_changer_l_url_de_la_configuration_est_un_changement_de_perimetre(): void
    {
        $this->assertTrue($this->crawl()->reached_end);
        $studio = $this->publier(self::STUDIO);

        // Le code (et non la console) change l'URL par défaut : le périmètre effectif noté par le passage change avec.
        config()->set('radar.crawl.sites.expat_dakar.start_url', self::APPARTEMENTS);
        $this->assertSame([self::APPARTEMENTS], $this->crawl()->start_urls);
        $this->crawl();

        $this->assertSame(0, app(RadarSourceWatch::class)->observe()['gone']);
        $this->assertNull($studio->refresh()->availability_asked_at);
    }

    public function test_elargir_les_urls_de_depart_laisse_detecter_la_disparition_d_une_annonce_de_l_ancien_perimetre(): void
    {
        $this->assertTrue($this->crawl()->reached_end);
        $studio = $this->publier(self::STUDIO);

        // Le porteur ajoute les appartements à la liste par défaut : l'ancien périmètre est contenu dans le nouveau.
        $this->regler([self::LIST, self::APPARTEMENTS]);
        $this->pages[self::LIST.'?page=2'] = str_replace('studio-fictif-plateau-9000004', 'studio-fictif-fann-9000099', $this->pages[self::LIST.'?page=2']);
        $this->assertTrue($this->crawl()->reached_end);
        $this->assertSame(0, app(RadarSourceWatch::class)->observe()['gone']);
        $deuxieme = $this->crawl();

        $this->assertSame(['gone' => 1, 'back' => 0, 'alerts' => 1], app(RadarSourceWatch::class)->observe());
        $studio->refresh();
        $this->assertSame($deuxieme->id, $studio->source_gone_run_id);
        $this->assertNotNull($studio->availability_asked_at, 'La question au titulaire part, comme sans réglage.');
    }

    public function test_un_passage_anterieur_a_la_colonne_se_lit_comme_l_url_actuelle_de_la_configuration(): void
    {
        $premier = $this->crawl();
        $studio = $this->publier(self::STUDIO);
        // Un passage d'avant la migration : sa colonne est nulle.
        RadarCrawlRun::query()->whereKey($premier->id)->update(['start_urls' => null]);

        $this->pages[self::LIST.'?page=2'] = str_replace('studio-fictif-plateau-9000004', 'studio-fictif-fann-9000099', $this->pages[self::LIST.'?page=2']);
        $this->crawl();
        $this->crawl();

        $this->assertSame(1, app(RadarSourceWatch::class)->observe()['gone']);
        $this->assertNotNull($studio->refresh()->source_gone_at);
    }

    public function test_sous_le_meme_perimetre_regle_la_disparition_se_conclut_toujours(): void
    {
        $this->regler([self::APPARTEMENTS]);
        $this->assertTrue($this->crawl()->reached_end);
        $ouakam = $this->publier(self::OUAKAM);

        $this->pages[self::APPARTEMENTS] = $this->page(['appartement-fictif-yoff-9100002']);
        $this->assertTrue($this->crawl()->reached_end);
        $this->assertSame(0, app(RadarSourceWatch::class)->observe()['gone']);
        $deuxieme = $this->crawl();

        $this->assertSame(['gone' => 1, 'back' => 0, 'alerts' => 1], app(RadarSourceWatch::class)->observe());
        $this->assertSame($deuxieme->id, $ouakam->refresh()->source_gone_run_id);
    }

    public function test_une_annonce_revue_sous_le_nouveau_perimetre_y_est_de_nouveau_jugee(): void
    {
        // Le studio est vu par la configuration, puis par une liste réglée qui le contient encore : il est jugé sous ce
        // périmètre-là, et sa disparition s'y conclut.
        $this->assertTrue($this->crawl()->reached_end);
        $studio = $this->publier(self::STUDIO);
        $this->regler([self::LIST.'?page=2']);
        $this->assertTrue($this->crawl()->reached_end);

        $this->pages[self::LIST.'?page=2'] = str_replace('studio-fictif-plateau-9000004', 'studio-fictif-fann-9000099', $this->pages[self::LIST.'?page=2']);
        $this->crawl();
        $this->crawl();

        $this->assertSame(1, app(RadarSourceWatch::class)->observe()['gone']);
        $this->assertNotNull($studio->refresh()->source_gone_at);
    }
}
