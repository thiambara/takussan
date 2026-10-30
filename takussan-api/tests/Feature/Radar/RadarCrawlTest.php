<?php

namespace Tests\Feature\Radar;

use App\Jobs\Radar\CrawlRadarSource;
use App\Jobs\Radar\ExtractRadarListing;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarCrawlStatus;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceSite;
use App\Models\RadarCrawlRun;
use App\Models\RadarCrawlSource;
use App\Models\RadarListing;
use App\Models\RadarListingSnapshot;
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
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Sleep;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2392 (AC1, AC2, AC4, AC5, AC8) — un passage de collecte, de la page de liste aux annonces et à leurs instantanés.
 *
 * Aucun test ne touche le réseau : `Http::preventStrayRequests()`, un résolveur DNS doublé, et des pages de liste écrites
 * à la main (`tests/fixtures/radar/crawl/`, données inventées). Le temps est figé, et l'attente du créneau du domaine
 * (`Sleep`) fait avancer l'horloge sans dormir.
 */
class RadarCrawlTest extends TestCase
{
    use OperateursPlateforme, RefreshDatabase;

    private const LIST = 'https://www.expat-dakar.com/immobilier';

    private const MERMOZ = 'https://www.expat-dakar.com/annonce/appartement-f3-fictif-mermoz-9000002';

    private const VILLA = 'https://www.expat-dakar.com/annonce/villa-fictive-a-ngor-9000001';

    private User $operator;

    /** @var array<string, string> URL → corps servi */
    private array $pages = [];

    private string $robots = "User-agent: *\nDisallow: /compte/\n";

    protected function setUp(): void
    {
        parent::setUp();

        // À la seconde : les colonnes `timestamp` n'ont pas de fraction.
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

    private function source(array $attributes = []): RadarCrawlSource
    {
        $source = $this->app->make(RadarCrawlSources::class)->find(RadarSourceSite::ExpatDakar->value);
        $source->fill($attributes)->save();

        return $source;
    }

    /** Un passage manuel, exécuté sur place (la suite est en `sync`). */
    private function crawl(): RadarCrawlRun
    {
        $run = $this->app->make(RadarCrawlScheduler::class)->startManually(RadarSourceSite::ExpatDakar, $this->operator);
        $this->assertNotNull($run);

        return $run->fresh();
    }

    private function listingOf(string $url): ?RadarListing
    {
        return RadarListing::query()->where('content_fingerprint', RadarListingIntake::urlFingerprint($url))->first();
    }

    // ── AC1 ───────────────────────────────────────────────────────────────────────────────────

    public function test_un_passage_cree_une_annonce_par_url_nouvelle_et_aucune_pour_une_url_connue(): void
    {
        // L'annonce de Mermoz est déjà connue (saisie à la main, sans le paramètre de suivi que porte la liste).
        $known = $this->app->make(RadarListingIntake::class)->fromUrls([self::MERMOZ], $this->operator)[0]['listing'];
        Bus::fake([ExtractRadarListing::class]);

        $run = $this->crawl();

        $this->assertSame(RadarCrawlStatus::Finished, $run->status);
        $this->assertSame(RadarCrawlRun::STOP_END, $run->stop_reason);
        $this->assertTrue($run->reached_end);
        $this->assertSame(2, $run->pages_read);
        $this->assertSame(4, $run->cards_seen);
        $this->assertSame(3, $run->listings_created);
        $this->assertSame(1, $run->listings_known);

        $this->assertSame(4, RadarListing::query()->count());
        $this->assertNull($known->fresh()->discovered_by_run_id, 'Une annonce connue ne change pas de provenance.');
        $created = RadarListing::query()->where('discovered_by_run_id', $run->id)->get();
        $this->assertCount(3, $created);
        foreach ($created as $listing) {
            $this->assertSame(RadarListingStage::Captured, $listing->stage);
            $this->assertSame(RadarSourceSite::ExpatDakar, $listing->source_site);
            $this->assertSame($this->operator->id, $listing->captured_by, 'L\'extraction est jugée au nom de l\'opérateur du passage.');
        }
        Bus::assertDispatchedTimes(ExtractRadarListing::class, 3);
    }

    public function test_une_url_connue_en_echec_d_extraction_n_est_pas_relancee_par_un_passage(): void
    {
        $failed = $this->app->make(RadarListingIntake::class)->fromUrls([self::VILLA], $this->operator)[0]['listing'];
        $failed->forceFill(['stage' => RadarListingStage::ExtractionFailed, 'stage_reason' => 'radar.fetch.robots'])->save();
        Bus::fake([ExtractRadarListing::class]);

        $this->crawl();

        $this->assertSame(RadarListingStage::ExtractionFailed, $failed->fresh()->stage);
        Bus::assertDispatchedTimes(ExtractRadarListing::class, 3);
    }

    // ── AC2 ───────────────────────────────────────────────────────────────────────────────────

    public function test_un_prix_change_entre_deux_passages_laisse_deux_instantanes_et_un_prix_inchange_prolonge_le_premier(): void
    {
        // La page 1 se lit au départ du passage ; l'attente du créneau avant la page 2 fait ensuite avancer l'horloge.
        $firstSeen = now()->toImmutable();
        $first = $this->crawl();
        $this->assertSame(4, $first->snapshots_opened);

        $this->travel(7)->hours();
        $this->pages[self::LIST] = str_replace('data-t-listing_price="450000.00"', 'data-t-listing_price="420000.00"', $this->pages[self::LIST]);
        $secondSeen = now()->toImmutable();
        $second = $this->crawl();
        $this->assertSame(1, $second->snapshots_opened);

        $mermoz = $this->listingOf(self::MERMOZ.'?utm_source=liste') ?? $this->listingOf(self::MERMOZ);
        $snapshots = RadarListingSnapshot::query()->where('radar_listing_id', $mermoz->id)->orderBy('id')->get();
        $this->assertCount(2, $snapshots);
        $this->assertSame('450000.00', $snapshots[0]->price);
        $this->assertSame('420000.00', $snapshots[1]->price);
        $this->assertTrue($snapshots[0]->last_seen_at->equalTo($firstSeen), 'L\'ancien prix n\'a plus été vu après le premier passage.');
        $this->assertTrue($snapshots[1]->first_seen_at->equalTo($secondSeen));
        $this->assertSame($second->id, $snapshots[1]->crawl_run_id);
        // Ce que la carte montre, documenté pour l'observatoire (TCK-2393).
        $this->assertSame('rent', $snapshots[1]->contract);
        $this->assertSame('apartment', $snapshots[1]->property_type);
        $this->assertSame(2, $snapshots[1]->bedrooms);
        $this->assertSame('95.00', $snapshots[1]->surface_m2);
        $this->assertSame('Mermoz, Dakar', $snapshots[1]->neighborhood_label);

        $villa = RadarListingSnapshot::query()->where('radar_listing_id', $this->listingOf(self::VILLA)->id)->get();
        $this->assertCount(1, $villa, 'Un prix inchangé n\'ouvre pas d\'instantané.');
        $this->assertSame(2, $villa[0]->observations);
        $this->assertTrue($villa[0]->first_seen_at->equalTo($firstSeen));
        $this->assertTrue($villa[0]->last_seen_at->equalTo($secondSeen));
    }

    public function test_un_passage_comble_les_colonnes_vides_de_l_instantane_par_la_lecture_sans_en_ouvrir_un(): void
    {
        $this->crawl();
        $villa = $this->listingOf(self::VILLA);
        $villa->forceFill(['stage' => RadarListingStage::Extracted, 'extracted' => [
            'city' => ['value' => 'Dakar', 'confidence' => 'high', 'evidence' => 'Dakar', 'flags' => []],
            'price' => ['value' => 150000000, 'confidence' => 'high', 'evidence' => '150 M', 'flags' => []],
        ]])->save();

        $this->travel(7)->hours();
        $this->crawl();

        $snapshots = RadarListingSnapshot::query()->where('radar_listing_id', $villa->id)->get();
        $this->assertCount(1, $snapshots);
        $this->assertSame('Dakar', $snapshots[0]->city);
    }

    // ── AC4 ───────────────────────────────────────────────────────────────────────────────────

    public function test_sans_geste_du_porteur_la_commande_ne_lance_aucun_passage(): void
    {
        Queue::fake();

        $this->artisan('radar:crawl')->assertSuccessful();

        Queue::assertNothingPushed();
        $this->assertSame(0, RadarCrawlRun::query()->count());
        $sources = RadarCrawlSource::query()->orderBy('site')->get();
        $this->assertSame(['coinafrique', 'expat_dakar'], $sources->map(fn ($s) => $s->site->value)->all());
        $this->assertFalse($sources->contains(fn (RadarCrawlSource $s) => $s->enabled), 'Les sources naissent éteintes.');
    }

    public function test_une_source_allumee_part_une_fois_puis_attend_sa_frequence(): void
    {
        Queue::fake();
        $this->source(['enabled' => true, 'operator_id' => $this->operator->id, 'frequency_minutes' => 360]);

        $this->artisan('radar:crawl')->assertSuccessful();
        $this->artisan('radar:crawl')->assertSuccessful();
        Queue::assertPushed(CrawlRadarSource::class, 1);

        RadarCrawlRun::query()->update(['status' => RadarCrawlStatus::Finished->value]);
        $this->travel(359)->minutes();
        $this->artisan('radar:crawl')->assertSuccessful();
        Queue::assertPushed(CrawlRadarSource::class, 1);

        $this->travel(1)->minutes();
        $this->artisan('radar:crawl')->assertSuccessful();
        Queue::assertPushed(CrawlRadarSource::class, 2);
        $this->assertSame(['schedule', 'schedule'], RadarCrawlRun::query()->pluck('trigger')->map(fn ($t) => $t->value)->all());
    }

    public function test_une_source_allumee_sans_operateur_ne_part_pas(): void
    {
        Queue::fake();
        $this->source(['enabled' => true, 'operator_id' => null]);

        $this->artisan('radar:crawl')->assertSuccessful();

        Queue::assertNothingPushed();
    }

    public function test_un_seul_passage_actif_par_site_et_un_passage_perdu_est_clos(): void
    {
        Queue::fake();
        $scheduler = $this->app->make(RadarCrawlScheduler::class);

        $this->assertNotNull($scheduler->startManually(RadarSourceSite::ExpatDakar, $this->operator));
        $this->assertNull($scheduler->startManually(RadarSourceSite::ExpatDakar, $this->operator), 'Un passage est déjà actif.');
        $this->assertNotNull($scheduler->startManually(RadarSourceSite::Coinafrique, $this->operator), 'Un autre site est libre.');

        $this->travel(61)->minutes();
        $this->artisan('radar:crawl')->assertSuccessful();

        $this->assertSame(2, RadarCrawlRun::query()->where('status', RadarCrawlStatus::Failed->value)->where('stop_reason', RadarCrawlScheduler::STOP_LOST)->count());
        $this->assertNotNull($scheduler->startManually(RadarSourceSite::ExpatDakar, $this->operator));
    }

    // ── AC5 ───────────────────────────────────────────────────────────────────────────────────

    public function test_une_page_que_le_robots_txt_interdit_n_est_pas_lue(): void
    {
        $this->robots = "User-agent: *\nDisallow: /immobilier\n";

        $run = $this->crawl();

        $this->assertSame(RadarCrawlStatus::Finished, $run->status);
        $this->assertSame('radar.fetch.robots', $run->stop_reason);
        $this->assertSame(0, $run->pages_read);
        $this->assertSame(0, RadarListing::query()->count());
        Http::assertNotSent(fn (Request $request) => $request->url() === self::LIST);
    }

    public function test_le_passage_s_arrete_au_plafond_de_pages_de_la_source(): void
    {
        $this->source(['max_pages' => 1]);

        $run = $this->crawl();

        $this->assertSame(RadarCrawlRun::STOP_MAX_PAGES, $run->stop_reason);
        $this->assertSame(1, $run->pages_read);
        $this->assertFalse($run->reached_end);
        Http::assertNotSent(fn (Request $request) => $request->url() === self::LIST.'?page=2');
    }

    public function test_une_page_sans_carte_arrete_le_passage(): void
    {
        $this->pages[self::LIST] = '<!doctype html><html><body><p>Structure inconnue</p></body></html>';

        $run = $this->crawl();

        $this->assertSame(RadarCrawlRun::STOP_NO_CARDS, $run->stop_reason);
        $this->assertSame(1, $run->pages_read);
    }

    // ── AC8 ───────────────────────────────────────────────────────────────────────────────────

    public function test_le_passage_est_mis_sur_la_file_longue(): void
    {
        config()->set('queue.default', 'database');
        Queue::fake();

        $this->app->make(RadarCrawlScheduler::class)->startManually(RadarSourceSite::ExpatDakar, $this->operator);

        Queue::assertPushed(CrawlRadarSource::class, fn (CrawlRadarSource $job) => $job->connection === 'database-long' && $job->queue === 'long');
    }
}
