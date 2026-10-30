<?php

namespace Tests\Feature\Radar;

use App\Jobs\Radar\ExtractRadarListing;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarCrawlStatus;
use App\Models\Enums\RadarCrawlTrigger;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceSite;
use App\Models\GeoNeighborhood;
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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2392 (ADR-0080, ADR-0077 §9) — la promesse de `privacy.ts` § 6 tenue par la collecte : une annonce purgée, ou
 * d'un annonceur qui a dit STOP, n'est plus observée. À la purge, ses instantanés sont SUPPRIMÉS si elle tombe pour un
 * STOP, une révocation ou `do_not_contact` (« une empreinte, et rien d'autre ») ; à l'échéance des 90 jours, ils sont
 * DÉTACHÉS : observation de marché anonyme (prix, quartier du référentiel, chambres, surface), sans passage, dates au
 * jour, sans rien qui relie à l'annonce ni à l'annonceur.
 *
 * Les bancs rouges de la vérification adverse et de la contre-vérification (B1-bis) sont ici, devenus tests.
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

    // ── La purge : supprimés pour un STOP, détachés et flous à 90 jours ───────────────────────

    /**
     * Les deux jointures du banc B1-bis de la contre-vérification : une ligne détachée retrouvait l'annonceur STOP (et
     * l'empreinte de son numéro) par l'instant de la purge, ou par le passage et la seconde de création.
     *
     * @return array{par_updated_at: list<object>, par_passage: list<object>}
     */
    private function jointures(): array
    {
        return [
            'par_updated_at' => DB::select('select s.id from radar_listing_snapshots s join radar_listings l on l.stage = ? and l.updated_at = s.updated_at where s.radar_listing_id is null', ['purged']),
            'par_passage' => DB::select('select s.id from radar_listing_snapshots s join radar_listings l on l.stage = ? and l.discovered_by_run_id = s.crawl_run_id and l.created_at = s.created_at where s.radar_listing_id is null', ['purged']),
        ];
    }

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
        $this->assertSame(0, $comptes['snapshots_detached'], 'Un STOP ne laisse pas même une observation anonyme.');
        $this->assertSame(0, RadarListingSnapshot::query()->whereNull('radar_listing_id')->count());
        $this->assertSame(['par_updated_at' => [], 'par_passage' => []], $this->jointures());
        $this->assertSame(3, RadarListingSnapshot::query()->whereNotNull('radar_listing_id')->count(), 'Les autres annonces gardent les leurs.');
        $this->assertNull($villa->fresh()->discovered_by_run_id);
    }

    public function test_b1_bis_une_annonce_do_not_contact_echue_perd_aussi_ses_instantanes(): void
    {
        $this->crawl();
        $villa = RadarListing::query()->where('content_fingerprint', RadarListingIntake::urlFingerprint(self::VILLA))->firstOrFail();
        $villa->forceFill(['stage' => RadarListingStage::DoNotContact])->save();
        $this->travel(91)->days();

        $comptes = $this->app->make(RadarPurger::class)->run();

        $this->assertSame(1, $comptes['snapshots_deleted']);
        $this->assertSame(3, $comptes['snapshots_detached'], 'Les trois autres, échues sans STOP, sont détachées.');
    }

    public function test_b1_bis_la_purge_a_90_jours_detache_sans_passage_ni_instant_qui_relie(): void
    {
        $this->crawl();
        $villa = RadarListing::query()->where('content_fingerprint', RadarListingIntake::urlFingerprint(self::VILLA))->firstOrFail();
        $avant = RadarListingSnapshot::query()->where('radar_listing_id', $villa->id)->sole();
        $this->travel(91)->days();
        $this->travel(5)->hours();

        $comptes = $this->app->make(RadarPurger::class)->run();

        $this->assertSame(4, $comptes['snapshots_detached']);
        $this->assertSame(0, $comptes['snapshots_deleted']);
        $this->assertSame(['par_updated_at' => [], 'par_passage' => []], $this->jointures());
        $this->assertNull($villa->fresh()->discovered_by_run_id, 'La fiche purgée ne dit plus quel passage l\'a trouvée.');

        $detache = $avant->fresh();
        $this->assertNull($detache->radar_listing_id);
        $this->assertNull($detache->crawl_run_id, 'Le passage reliait la ligne à la fiche découverte.');
        $jour = fn ($instant) => $instant->copy()->startOfDay();
        $this->assertTrue($detache->first_seen_at->equalTo($jour($avant->first_seen_at)));
        $this->assertTrue($detache->last_seen_at->equalTo($jour($avant->last_seen_at)));
        $this->assertTrue($detache->created_at->equalTo($jour($avant->created_at)));
        $this->assertTrue($detache->updated_at->equalTo($jour($avant->last_seen_at)), 'updated_at ne porte plus l\'instant de la purge.');
        $this->assertFalse($detache->updated_at->isSameDay(now()));
    }

    public function test_la_purge_detache_les_instantanes_et_n_en_garde_que_l_observation_de_marche(): void
    {
        $quartier = GeoNeighborhood::factory()->create();
        $run = RadarCrawlRun::query()->create([
            'site' => RadarSourceSite::ExpatDakar->value, 'trigger' => RadarCrawlTrigger::Schedule->value,
            'status' => RadarCrawlStatus::Finished->value, 'operator_id' => $this->operator->id,
        ]);
        $echue = RadarListing::factory()->extracted()->create(['purge_at' => now()->subDay(), 'discovered_by_run_id' => $run->id]);
        $vivante = RadarListing::factory()->extracted()->create(['purge_at' => now()->addDays(30)]);
        $etat = [
            'crawl_run_id' => $run->id, 'price' => 450000, 'rent_period' => 'monthly', 'contract' => 'rent',
            'property_type' => 'apartment', 'surface_m2' => 120, 'bedrooms' => 3, 'neighborhood_label' => 'Mermoz, Dakar',
            'geo_neighborhood_id' => $quartier->id, 'city' => 'Dakar', 'title_fingerprint' => hash('sha256', 'titre'),
            'first_seen_at' => now()->subDays(100), 'last_seen_at' => now()->subDay(), 'observations' => 3,
        ];
        $snapshot = RadarListingSnapshot::query()->create($etat + ['radar_listing_id' => $echue->id]);
        $autre = RadarListingSnapshot::query()->create($etat + ['radar_listing_id' => $vivante->id]);

        $comptes = $this->app->make(RadarPurger::class)->run();

        $this->assertSame(RadarListingStage::Purged, $echue->fresh()->stage);
        $this->assertSame(1, $comptes['snapshots_detached']);
        $this->assertSame(0, RadarListingSnapshot::query()->where('radar_listing_id', $echue->id)->count());

        $detache = $snapshot->fresh();
        $this->assertNotNull($detache, 'Détaché, pas supprimé : la série reste à l\'observatoire.');
        $this->assertNull($detache->radar_listing_id);
        $this->assertNull($detache->title_fingerprint);
        $this->assertNull($detache->neighborhood_label, 'Le lieu ÉCRIT par l\'annonceur part ; le quartier du référentiel reste.');
        $this->assertEquals(450000, $detache->price);
        $this->assertSame($quartier->id, $detache->geo_neighborhood_id);
        $this->assertSame(3, $detache->bedrooms);
        $this->assertEquals(120, $detache->surface_m2);
        $this->assertSame('Dakar', $detache->city);
        $this->assertSame(3, $detache->observations);
        $this->assertTrue($detache->first_seen_at->equalTo(now()->subDays(100)->startOfDay()), 'Au jour près, pas à la seconde.');

        $this->assertSame($vivante->id, $autre->fresh()->radar_listing_id, 'Une annonce non due garde ses instantanés.');
        $this->assertNotNull($autre->fresh()->title_fingerprint);
        $this->assertSame($run->id, $autre->fresh()->crawl_run_id);
    }
}
