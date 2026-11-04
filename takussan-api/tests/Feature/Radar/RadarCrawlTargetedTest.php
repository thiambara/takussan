<?php

namespace Tests\Feature\Radar;

use App\Jobs\Radar\ExtractRadarListing;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarCrawlDiscovery;
use App\Models\Enums\RadarCrawlScope;
use App\Models\Enums\RadarCrawlStatus;
use App\Models\Enums\RadarSourceSite;
use App\Models\Enums\RadarTargetOrigin;
use App\Models\Enums\RadarTargetStatus;
use App\Models\RadarCrawlRun;
use App\Models\RadarListing;
use App\Models\RadarTarget;
use App\Models\User;
use App\Services\Radar\Crawl\RadarCrawlScheduler;
use App\Services\Radar\Crawl\RadarCrawlSources;
use App\Services\Radar\HostResolver;
use App\Services\Radar\RadarListingIntake;
use App\Services\Radar\Targets\RadarTargetCriteria;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2468 (ADR-0087 §5, AC1, AC4) — une source ciblée ne saisit que les cartes qu'une cible active peut vouloir.
 *
 * Aucun réseau : `Http::preventStrayRequests()`, un résolveur DNS doublé, une page de liste d'Expat-Dakar écrite ici à la
 * main (données inventées) dans la forme des fixtures de TCK-2392 — l'adaptateur réel la lit.
 */
class RadarCrawlTargetedTest extends TestCase
{
    use OperateursPlateforme, RefreshDatabase;

    private const LIST = 'https://www.expat-dakar.com/immobilier';

    private const VILLA = 'https://www.expat-dakar.com/annonce/villa-fictive-a-vendre-9100001';

    private const APPART = 'https://www.expat-dakar.com/annonce/appartement-fictif-a-louer-9100002';

    private User $operator;

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

        Http::fake(function (Request $request) {
            if (str_ends_with(parse_url($request->url(), PHP_URL_PATH) ?? '', '/robots.txt')) {
                return Http::response("User-agent: *\nDisallow: /compte/\n", 200, ['Content-Type' => 'text/plain']);
            }

            return $request->url() === self::LIST
                ? Http::response($this->page(), 200, ['Content-Type' => 'text/html; charset=utf-8'])
                : Http::response('introuvable', 404, ['Content-Type' => 'text/html']);
        });

        $this->operator = $this->operateur(PlatformProfileLevel::SuperAdmin);
        // TCK-2467 — ces passages éprouvent le filtre sur une page de LISTE : la source lit ses listes, pas son sitemap.
        $this->app->make(RadarCrawlSources::class)->all()->each->update(['discovery' => RadarCrawlDiscovery::Lists]);
    }

    /** Deux cartes : une villa à vendre à 300 M, un appartement à louer sans prix. */
    private function page(): string
    {
        return <<<'HTML'
            <!doctype html>
            <html lang="fr"><head><meta charset="utf-8"><title>Immobilier - fixture TCK-2468</title></head>
            <body><div class="tw-sr-results">
              <article class="tw-sr-card"><h2><a href="https://www.expat-dakar.com/annonce/villa-fictive-a-vendre-9100001" class="tw-sr-card__title-link" data-t-listing_category_slug="villas-a-vendre" data-t-listing_price="300000000.00" data-t-listing_currency="XOF" data-t-listing_location_title="Almadies, Dakar">Villa fictive à vendre</a></h2></article>
              <article class="tw-sr-card"><h2><a href="https://www.expat-dakar.com/annonce/appartement-fictif-a-louer-9100002" class="tw-sr-card__title-link" data-t-listing_category_slug="appartements-a-louer" data-t-listing_location_title="Almadies, Dakar">Appartement fictif à louer</a></h2></article>
            </div></body></html>
            HTML;
    }

    private function scope(RadarCrawlScope $scope): void
    {
        $source = $this->app->make(RadarCrawlSources::class)->find(RadarSourceSite::ExpatDakar->value);
        $source->fill(['scope' => $scope])->save();
    }

    /** @param  array<string, mixed>  $criteria */
    private function target(array $criteria, RadarTargetStatus $status = RadarTargetStatus::Active): RadarTarget
    {
        $normalized = RadarTargetCriteria::normalize($criteria);

        return RadarTarget::query()->create([
            'name' => 'Cible de test', 'origin' => RadarTargetOrigin::Operator, 'status' => $status,
            'criteria' => $normalized, 'criteria_signature' => RadarTargetCriteria::signature($normalized),
        ]);
    }

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

    public function test_la_portee_d_une_source_est_ciblee_par_defaut(): void
    {
        $source = $this->app->make(RadarCrawlSources::class)->find(RadarSourceSite::ExpatDakar->value);

        $this->assertSame(RadarCrawlScope::Targeted, $source->fresh()->scope);
    }

    // ── AC1, AC4 ──────────────────────────────────────────────────────────────────────────────

    public function test_une_carte_hors_cible_ne_cree_rien_et_une_carte_sans_prix_est_saisie(): void
    {
        $this->target(['types' => ['apartment'], 'contract' => 'rent', 'price_max' => 700_000]);

        $run = $this->crawl();

        $this->assertSame(RadarCrawlStatus::Finished, $run->status);
        $this->assertSame(RadarCrawlRun::STOP_END, $run->stop_reason);
        $this->assertSame(2, $run->cards_seen);
        $this->assertNull($this->listingOf(self::VILLA), 'La villa à vendre 300 M ne peut correspondre à aucune cible : aucune ligne.');
        $this->assertNotNull($this->listingOf(self::APPART), 'Un prix absent de la carte ne l\'exclut pas.');
        $this->assertSame(1, $run->listings_created);
        $this->assertSame(1, $run->cards_skipped);
        $this->assertSame(1, RadarListing::query()->count());
    }

    public function test_une_cible_en_pause_ou_d_un_autre_site_ne_compte_pas(): void
    {
        $this->target(['contract' => 'sale'], RadarTargetStatus::Paused);
        $this->target(['contract' => 'rent', 'sites' => ['coinafrique']]);

        $run = $this->crawl();

        $this->assertSame(RadarCrawlRun::STOP_END, $run->stop_reason);
        $this->assertSame(2, $run->cards_skipped, 'aucune cible active pour le site : aucune carte nouvelle n\'est saisie');
        $this->assertSame(0, RadarListing::query()->count());
    }

    /**
     * Revue adverse du 2026-11-04 (« à signaler », décision de la session) — une source ciblée SANS cible active n'est plus
     * aveugle : elle lit ses listes pour OBSERVER les annonces déjà connues (instantanés de prix, et une lecture complète
     * qui sert l'observatoire), mais ne saisit aucune annonce neuve (comptées dans `cards_skipped`). Avant, le passage
     * s'arrêtait avant de lire (`radar.crawl.no_target`, 0 page) : retirer la dernière cible, ou déployer, aveuglait
     * l'observatoire.
     */
    public function test_une_source_ciblee_sans_cible_active_observe_les_connues_et_ne_saisit_rien_de_neuf(): void
    {
        $known = $this->app->make(RadarListingIntake::class)->fromUrls([self::VILLA], $this->operator)[0]['listing'];
        Bus::fake([ExtractRadarListing::class]);

        $run = $this->crawl();

        $this->assertSame(RadarCrawlStatus::Finished, $run->status);
        $this->assertSame(RadarCrawlRun::STOP_END, $run->stop_reason);
        $this->assertTrue($run->reached_end, 'la lecture est complète : l\'observatoire peut conclure');
        $this->assertSame(1, $run->pages_read);
        $this->assertSame(1, $run->listings_known);
        $this->assertSame(1, $known->snapshots()->count(), 'la villa connue est observée');
        $this->assertSame(1, $run->cards_skipped, 'l\'appartement neuf n\'est pas saisi');
        $this->assertSame(0, $run->listings_created);
        $this->assertNull($this->listingOf(self::APPART));
        Bus::assertNotDispatched(ExtractRadarListing::class);
    }

    public function test_une_source_reglee_sur_tout_saisit_chaque_carte_comme_avant(): void
    {
        $this->scope(RadarCrawlScope::All);
        $this->target(['types' => ['apartment'], 'contract' => 'rent', 'price_max' => 700_000]);

        $run = $this->crawl();

        $this->assertSame(RadarCrawlRun::STOP_END, $run->stop_reason);
        $this->assertSame(2, $run->listings_created);
        $this->assertSame(0, $run->cards_skipped);
        $this->assertNotNull($this->listingOf(self::VILLA));
    }

    public function test_une_annonce_deja_connue_reste_observee_meme_hors_cible(): void
    {
        $known = $this->app->make(RadarListingIntake::class)->fromUrls([self::VILLA], $this->operator)[0]['listing'];
        Bus::fake([ExtractRadarListing::class]);
        $this->target(['types' => ['apartment'], 'contract' => 'rent']);

        $run = $this->crawl();

        $this->assertSame(1, $run->listings_known, 'Le filtre ne borne que la saisie d\'une annonce NOUVELLE.');
        $this->assertSame(0, $run->cards_skipped);
        $this->assertSame(1, $known->snapshots()->count());
    }
}
