<?php

namespace Tests\Feature\Radar;

use App\Jobs\Radar\ExtractRadarListing;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarCrawlStatus;
use App\Models\Enums\RadarCrawlTrigger;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceSite;
use App\Models\RadarAdvertiser;
use App\Models\RadarCrawlRun;
use App\Models\RadarListing;
use App\Models\RadarListingSnapshot;
use App\Models\User;
use App\Services\Radar\Crawl\RadarCrawlScheduler;
use App\Services\Radar\HostResolver;
use App\Services\Radar\RadarListingIntake;
use App\Services\Radar\RadarPurger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2392 (ADR-0080, ADR-0077 §9) — la promesse de `privacy.ts` § 6 tenue par la collecte : une annonce purgée, ou
 * d'un annonceur qui a dit STOP, n'est plus observée ; et sa purge SUPPRIME ses instantanés, quelle qu'en soit la raison
 * (STOP, révocation, `do_not_contact` ou 90 jours) : détachée, une ligne se rejoignait encore à sa fiche (ADR-0080 § 4).
 *
 * Les bancs rouges des vérifications adverses (B1, B1-bis, I3) sont ici, devenus tests.
 */
class RadarSnapshotPrivacyTest extends TestCase
{
    use OperateursPlateforme, RefreshDatabase;

    private const LIST = 'https://www.expat-dakar.com/immobilier';

    private const VILLA = 'https://www.expat-dakar.com/annonce/villa-fictive-a-ngor-9000001';

    private User $operator;

    /** @var array<string, string> */
    private array $pages = [];

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
        $fixture = fn (string $name) => (string) file_get_contents(base_path('tests/fixtures/radar/crawl/'.$name));
        $this->pages = [self::LIST => $fixture('expat-dakar-page-1.html'), self::LIST.'?page=2' => $fixture('expat-dakar-page-2.html')];
        Http::fake(function (Request $request) {
            if (str_ends_with(parse_url($request->url(), PHP_URL_PATH) ?? '', '/robots.txt')) {
                return Http::response("User-agent: *\nDisallow: /compte/\n", 200, ['Content-Type' => 'text/plain']);
            }

            return isset($this->pages[$request->url()])
                ? Http::response($this->pages[$request->url()], 200, ['Content-Type' => 'text/html; charset=utf-8'])
                : Http::response('introuvable', 404, ['Content-Type' => 'text/html']);
        });
        $this->operator = $this->operateur(PlatformProfileLevel::SuperAdmin);
    }

    private function crawl(): RadarCrawlRun
    {
        return $this->app->make(RadarCrawlScheduler::class)->startManually(RadarSourceSite::ExpatDakar, $this->operator)->fresh();
    }

    private function villa(): RadarListing
    {
        return $this->app->make(RadarListingIntake::class)->fromUrls([self::VILLA], $this->operator)[0]['listing'];
    }

    // ── La collecte n'observe plus ─────────────────────────────────────────────────────────────

    public function test_une_annonce_purgee_apres_stop_n_est_plus_observee_ni_comptee(): void
    {
        $villa = $this->villa();
        $stop = RadarAdvertiser::factory()->create(['do_not_contact_at' => now()]);
        $villa->forceFill(['radar_advertiser_id' => $stop->id, 'stage' => RadarListingStage::DoNotContact])->save();
        $this->app->make(RadarPurger::class)->run($stop->id);
        $this->assertSame(RadarListingStage::Purged, $villa->fresh()->stage);

        $premier = $this->crawl();
        $this->travel(7)->hours();
        $this->pages[self::LIST] = str_replace('data-t-listing_price="150000000.00"', 'data-t-listing_price="140000000.00"', $this->pages[self::LIST]);
        $this->crawl();

        $this->assertSame(0, RadarListingSnapshot::query()->where('radar_listing_id', $villa->id)->count());
        $this->assertSame(4, $premier->cards_seen);
        $this->assertSame(0, $premier->listings_known, 'L\'annonce purgée n\'est pas comptée comme connue observée.');
        $this->assertSame(3, $premier->listings_created);
        $this->assertSame(RadarListingStage::Purged, $villa->fresh()->stage, 'Elle n\'est pas non plus ressaisie.');
    }

    public function test_une_annonce_do_not_contact_pas_encore_purgee_n_est_pas_observee(): void
    {
        $villa = $this->villa();
        $villa->forceFill(['stage' => RadarListingStage::DoNotContact])->save();

        $this->crawl();

        $this->assertSame(0, RadarListingSnapshot::query()->where('radar_listing_id', $villa->id)->count());
    }

    public function test_une_annonce_dont_l_annonceur_a_dit_stop_n_est_pas_observee_quelle_que_soit_son_etape(): void
    {
        $villa = $this->villa();
        $stop = RadarAdvertiser::factory()->create(['do_not_contact_at' => now()]);
        $villa->forceFill(['radar_advertiser_id' => $stop->id, 'stage' => RadarListingStage::Extracted])->save();

        $run = $this->crawl();

        $this->assertSame(0, RadarListingSnapshot::query()->where('radar_listing_id', $villa->id)->count());
        $this->assertSame(0, $run->listings_known);
    }

    public function test_une_annonce_connue_et_libre_reste_observee(): void
    {
        $villa = $this->villa();

        $run = $this->crawl();

        $this->assertSame(1, RadarListingSnapshot::query()->where('radar_listing_id', $villa->id)->count());
        $this->assertSame(1, $run->listings_known);
    }

    // ── La purge supprime les instantanés, quelle qu'en soit la raison ──────────────────────────

    public function test_b1_bis_la_purge_pour_stop_supprime_les_instantanes_de_l_annonceur(): void
    {
        $this->crawl();
        $villa = RadarListing::query()->where('content_fingerprint', RadarListingIntake::urlFingerprint(self::VILLA))->firstOrFail();
        $this->travel(3)->days();
        $stop = RadarAdvertiser::factory()->create(['do_not_contact_at' => now()]);
        $villa->forceFill(['radar_advertiser_id' => $stop->id, 'stage' => RadarListingStage::DoNotContact])->save();
        $this->travel(2)->minutes();

        $comptes = $this->app->make(RadarPurger::class)->run($stop->id);

        $this->assertSame(RadarListingStage::Purged, $villa->fresh()->stage);
        $this->assertSame(1, $comptes['snapshots_deleted']);
        $this->assertSame(0, RadarListingSnapshot::query()->where('radar_listing_id', $villa->id)->count());
        $this->assertSame(3, RadarListingSnapshot::query()->count(), 'Les autres annonces gardent les leurs.');
        $this->assertNull($villa->fresh()->discovered_by_run_id);
    }

    public function test_b1_bis_la_purge_a_90_jours_supprime_aussi_les_instantanes(): void
    {
        // La troisième passe (I3) : détachée, une ligne se rejoignait encore à sa fiche purgée par le rang des `id` et
        // par les dates. Il n'y a plus de ligne à rejoindre.
        $this->crawl();
        $villa = RadarListing::query()->where('content_fingerprint', RadarListingIntake::urlFingerprint(self::VILLA))->firstOrFail();
        $this->travel(91)->days();

        $comptes = $this->app->make(RadarPurger::class)->run();

        $this->assertSame(4, $comptes['listings']);
        $this->assertSame(4, $comptes['snapshots_deleted']);
        $this->assertSame(0, RadarListingSnapshot::query()->count(), 'Aucune ligne ne survit à sa fiche, ni liée, ni détachée.');
        $this->assertNull($villa->fresh()->discovered_by_run_id, 'La fiche purgée ne dit plus quel passage l\'a trouvée.');
    }

    public function test_la_purge_ne_touche_pas_les_instantanes_d_une_annonce_non_due(): void
    {
        $run = RadarCrawlRun::query()->create([
            'site' => RadarSourceSite::ExpatDakar->value, 'trigger' => RadarCrawlTrigger::Schedule->value,
            'status' => RadarCrawlStatus::Finished->value, 'operator_id' => $this->operator->id,
        ]);
        $echue = RadarListing::factory()->extracted()->create(['purge_at' => now()->subDay(), 'discovered_by_run_id' => $run->id]);
        $vivante = RadarListing::factory()->extracted()->create(['purge_at' => now()->addDays(30), 'discovered_by_run_id' => $run->id]);
        $etat = ['crawl_run_id' => $run->id, 'price' => 450000, 'title_fingerprint' => hash('sha256', 'titre'),
            'first_seen_at' => now()->subDays(100), 'last_seen_at' => now()->subDay(), 'observations' => 3];
        RadarListingSnapshot::query()->create($etat + ['radar_listing_id' => $echue->id]);
        $autre = RadarListingSnapshot::query()->create($etat + ['radar_listing_id' => $vivante->id]);

        $comptes = $this->app->make(RadarPurger::class)->run();

        $this->assertSame(1, $comptes['snapshots_deleted']);
        $this->assertSame([$autre->id], RadarListingSnapshot::query()->pluck('id')->all());
        $this->assertSame($run->id, $autre->fresh()->crawl_run_id);
        $this->assertNotNull($autre->fresh()->title_fingerprint);
        $this->assertSame($run->id, $vivante->fresh()->discovered_by_run_id);
    }
}
