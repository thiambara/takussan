<?php

namespace Tests\Feature\Radar;

use App\Ai\Agents\RadarExtraction;
use App\Jobs\Radar\ExtractRadarListing;
use App\Jobs\Radar\RefreshRadarListing;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RadarCrawlDiscovery;
use App\Models\Enums\RadarCrawlScope;
use App\Models\Enums\RadarCrawlStatus;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceSite;
use App\Models\Enums\RadarTargetOrigin;
use App\Models\Enums\RadarTargetStatus;
use App\Models\RadarCrawlRun;
use App\Models\RadarListing;
use App\Models\RadarListingSnapshot;
use App\Models\RadarTarget;
use App\Models\User;
use App\Services\Radar\Crawl\CoinafriqueAdapter;
use App\Services\Radar\Crawl\ExpatDakarAdapter;
use App\Services\Radar\Crawl\RadarCrawler;
use App\Services\Radar\Crawl\RadarCrawlScheduler;
use App\Services\Radar\Crawl\RadarCrawlSources;
use App\Services\Radar\HostResolver;
use App\Services\Radar\Observatory\RadarSourceWatch;
use App\Services\Radar\RadarListingIntake;
use App\Services\Radar\Targets\RadarTargetCriteria;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2467 (ADR-0087 §4, AC1 à AC4) — une source Expat-Dakar réglée `sitemap` (son défaut) : le VRAI passage de collecte, le
 * vrai adaptateur, le vrai lecteur de sitemap, le vrai `UrlFetcher` — et aucun réseau (`Http::preventStrayRequests()`, un
 * résolveur DNS doublé). Les sitemaps sont écrits ici à la main (URL et dates inventées), dans la forme relevée le
 * 2026-11-04 ; la page d'annonce est la fixture de TCK-2465.
 *
 * L'adaptateur déclare neuf sitemaps : ceux qu'un test ne règle pas servent une seule annonce, {@see self::FILLER}, déjà
 * connue — une lecture complète demande les neuf.
 */
class RadarSitemapCrawlTest extends TestCase
{
    use OperateursPlateforme, RefreshDatabase;

    private const SITEMAP = 'https://www.expat-dakar.com/sitemap-listings-%s-fr.xml';

    private const ANNONCE = 'https://www.expat-dakar.com/annonce/';

    private const FILLER = self::ANNONCE.'annonce-de-remplissage-9300000';

    private const FILLER_LASTMOD = '2026-01-01T00:00:00+00:00';

    private User $operator;

    /** @var array<string, array{0: int, 1: string, 2: string}> URL → statut, type, corps */
    private array $served = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->freezeSecond();
        Sleep::fake(syncWithCarbon: true);
        Cache::flush();
        Http::preventStrayRequests();
        Bus::fake([ExtractRadarListing::class, RefreshRadarListing::class]);

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
            [$status, $type, $body] = $this->served[$request->url()] ?? [404, 'text/html', 'introuvable'];

            return Http::response($body, $status, ['Content-Type' => $type]);
        });

        $this->operator = $this->operateur(PlatformProfileLevel::SuperAdmin);
        // Le filtre des cibles a ses propres épreuves plus bas : par défaut, la source saisit tout ce qu'elle voit.
        $this->app->make(RadarCrawlSources::class)->all()->each->update(['scope' => RadarCrawlScope::All]);

        $filler = $this->connue(self::FILLER);
        $filler->forceFill(['source_lastmod' => CarbonImmutable::parse(self::FILLER_LASTMOD)])->save();
        $this->sitemaps([]);
    }

    // ── Outils ─────────────────────────────────────────────────────────────────────────────────

    /**
     * Sert les neuf sitemaps : ceux de `$parCategorie` (URL → `lastmod`, null : sans date), les autres avec la seule annonce
     * de remplissage.
     *
     * @param  array<string, array<string, string|null>>  $parCategorie
     */
    private function sitemaps(array $parCategorie): void
    {
        foreach ($this->app->make(ExpatDakarAdapter::class)->sitemapUrls() as $url) {
            $categorie = (string) preg_replace('#^.*/sitemap-listings-(.+)-fr\.xml$#', '$1', $url);
            $this->served[$url] = [200, 'application/xml', self::urlset($parCategorie[$categorie] ?? [self::FILLER => self::FILLER_LASTMOD])];
        }
    }

    /** @param  array<string, string|null>  $urls */
    private static function urlset(array $urls): string
    {
        $xml = '<?xml version="1.0" encoding="UTF-8"?>'."\n"
            .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'."\n";
        foreach ($urls as $url => $lastmod) {
            $xml .= '<url><loc>'.$url.'</loc>'.($lastmod === null ? '' : '<lastmod>'.$lastmod.'</lastmod>')
                .'<image:image><image:loc>https://i.roamcdn.net/hz/ed/listing-gallery-full-1920w/X/-/Y/0000.jpg</image:loc></image:image></url>'."\n";
        }

        return $xml.'</urlset>';
    }

    private static function sitemap(string $categorie): string
    {
        return sprintf(self::SITEMAP, $categorie);
    }

    private function connue(string $url): RadarListing
    {
        $listing = $this->app->make(RadarListingIntake::class)->fromUrls([$url], $this->operator)[0]['listing'];

        return $listing->refresh();
    }

    private function crawl(): RadarCrawlRun
    {
        // Les saisies de la préparation ne comptent pas : seules celles du passage sont observées.
        Bus::fake([ExtractRadarListing::class, RefreshRadarListing::class]);
        $run = $this->app->make(RadarCrawlScheduler::class)->startManually(RadarSourceSite::ExpatDakar, $this->operator);
        $this->assertNotNull($run);

        return $run->fresh();
    }

    private function annonce(string $url): ?RadarListing
    {
        return RadarListing::query()->where('content_fingerprint', RadarListingIntake::urlFingerprint($url))->first();
    }

    /** @param  array<string, mixed>  $criteria */
    private function cible(array $criteria): void
    {
        $normalized = RadarTargetCriteria::normalize($criteria);
        RadarTarget::query()->create([
            'name' => 'Cible de test', 'origin' => RadarTargetOrigin::Operator, 'status' => RadarTargetStatus::Active,
            'criteria' => $normalized, 'criteria_signature' => RadarTargetCriteria::signature($normalized),
        ]);
    }

    // ── Le réglage ────────────────────────────────────────────────────────────────────────────

    public function test_le_sitemap_est_le_defaut_d_expat_dakar_et_les_listes_celui_de_coinafrique(): void
    {
        $sources = $this->app->make(RadarCrawlSources::class);

        $this->assertNull($sources->find('expat_dakar')->discovery, 'Nulle tant que la console ne la règle pas.');
        $this->assertSame(RadarCrawlDiscovery::Sitemap, RadarCrawlDiscovery::effective(null, $this->app->make(ExpatDakarAdapter::class)));
        $this->assertSame(RadarCrawlDiscovery::Lists, RadarCrawlDiscovery::effective(null, $this->app->make(CoinafriqueAdapter::class)));
        $this->assertSame(RadarCrawlDiscovery::Lists, RadarCrawlDiscovery::effective(RadarCrawlDiscovery::Sitemap, $this->app->make(CoinafriqueAdapter::class)),
            'Un site sans sitemap ne lit jamais un sitemap vide.');
        $this->assertSame([], $this->app->make(CoinafriqueAdapter::class)->sitemapUrls());
    }

    public function test_le_perimetre_d_un_passage_est_la_liste_triee_de_ses_sitemaps(): void
    {
        $run = $this->crawl();

        $attendu = $this->app->make(ExpatDakarAdapter::class)->sitemapUrls();
        sort($attendu);
        $this->assertSame($attendu, $run->start_urls);
        $this->assertCount(9, $attendu);
        $this->assertSame(9, $run->pages_read, 'Le plafond de pages des listes (5 par défaut) ne borne pas les sitemaps.');
        $this->assertTrue($run->reached_end);
        $this->assertSame(RadarCrawlRun::STOP_END, $run->stop_reason);
    }

    public function test_une_source_reglee_sur_les_listes_ne_lit_aucun_sitemap(): void
    {
        $this->app->make(RadarCrawlSources::class)->find('expat_dakar')->fill(['discovery' => RadarCrawlDiscovery::Lists])->save();

        $run = $this->crawl();

        $this->assertSame(['https://www.expat-dakar.com/immobilier'], $run->start_urls);
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'sitemap'));
    }

    // ── AC1 ───────────────────────────────────────────────────────────────────────────────────

    public function test_ac1_trois_urls_dont_une_connue_au_meme_lastmod_saisissent_deux_annonces_et_n_en_relisent_aucune(): void
    {
        $connue = $this->connue(self::ANNONCE.'appartement-connu-9300001');
        $connue->forceFill(['stage' => RadarListingStage::Extracted, 'source_lastmod' => CarbonImmutable::parse('2026-10-20T08:00:00+00:00')])->save();
        $this->sitemaps(['appartements-a-louer' => [
            self::ANNONCE.'appartement-connu-9300001' => '2026-10-20T08:00:00+00:00',
            self::ANNONCE.'appartement-neuf-9300002' => '2026-11-02T10:00:00+00:00',
            self::ANNONCE.'appartement-neuf-9300003' => '2026-11-03T10:00:00+00:00',
        ]]);

        $run = $this->crawl();

        $this->assertSame(RadarCrawlStatus::Finished, $run->status);
        $this->assertTrue($run->reached_end);
        $this->assertSame(2, $run->listings_created);
        $this->assertSame(2, $run->listings_known, 'La connue et l\'annonce de remplissage.');
        $this->assertSame(4, $run->cards_seen);
        Bus::assertNotDispatched(RefreshRadarListing::class);
        Bus::assertDispatchedTimes(ExtractRadarListing::class, 2);

        $neuve = $this->annonce(self::ANNONCE.'appartement-neuf-9300003');
        $this->assertNotNull($neuve);
        $this->assertSame('2026-11-03 10:00:00', $neuve->source_lastmod?->utc()->format('Y-m-d H:i:s'), 'Sa date de référence est celle du sitemap.');
        $instantane = $neuve->snapshots()->sole();
        $this->assertSame('apartment', $instantane->property_type, 'La catégorie du sitemap fait la carte.');
        $this->assertSame('rent', $instantane->contract);
        $this->assertSame(1, $connue->snapshots()->count(), 'La connue est vue : sa présence est observée.');
    }

    public function test_une_annonce_saisie_par_les_listes_ne_se_relit_pas_pour_un_lastmod_anterieur_a_sa_saisie(): void
    {
        $connue = $this->connue(self::ANNONCE.'appartement-des-listes-9300004');
        $connue->forceFill(['stage' => RadarListingStage::Extracted])->save();
        $this->sitemaps(['appartements-a-louer' => [self::ANNONCE.'appartement-des-listes-9300004' => '2026-09-01T00:00:00+00:00']]);

        $this->crawl();

        Bus::assertNotDispatched(RefreshRadarListing::class);
        $this->assertSame('2026-09-01 00:00:00', $connue->refresh()->source_lastmod?->utc()->format('Y-m-d H:i:s'), 'Le lastmod devient sa référence.');
    }

    public function test_une_annonce_reduite_au_silence_n_est_ni_relue_ni_comptee(): void
    {
        $purgee = $this->connue(self::ANNONCE.'appartement-purge-9300005');
        $purgee->forceFill(['stage' => RadarListingStage::Purged])->save();
        $this->sitemaps(['appartements-a-louer' => [self::ANNONCE.'appartement-purge-9300005' => '2026-11-04T00:00:00+00:00']]);

        $run = $this->crawl();

        $this->assertSame(1, $run->listings_known, 'Seule l\'annonce de remplissage.');
        Bus::assertNotDispatched(RefreshRadarListing::class);
        $this->assertSame(0, $purgee->snapshots()->count());
    }

    public function test_une_source_ciblee_ne_saisit_que_ce_que_la_categorie_permet(): void
    {
        $this->app->make(RadarCrawlSources::class)->find('expat_dakar')->fill(['scope' => RadarCrawlScope::Targeted])->save();
        $this->cible(['types' => ['apartment'], 'contract' => 'rent']);
        $this->sitemaps([
            'appartements-a-louer' => [self::ANNONCE.'appartement-vise-9300006' => '2026-11-03T00:00:00+00:00'],
            'terrains-a-vendre' => [self::ANNONCE.'terrain-hors-cible-9300007' => '2026-11-03T00:00:00+00:00'],
        ]);

        $run = $this->crawl();

        $this->assertNotNull($this->annonce(self::ANNONCE.'appartement-vise-9300006'));
        $this->assertNull($this->annonce(self::ANNONCE.'terrain-hors-cible-9300007'), 'Un terrain à vendre ne peut correspondre à aucune cible.');
        $this->assertSame(1, $run->cards_skipped);
        $this->assertSame(1, $run->listings_created);
    }

    /**
     * Revue adverse du 2026-11-04 (« à signaler ») — une source ciblée sans cible active lit quand même ses sitemaps : les
     * annonces connues y sont observées (présence, relecture d'un `lastmod` qui avance) et la lecture complète sert
     * l'observatoire ; aucune annonce neuve n'est saisie.
     */
    public function test_une_source_ciblee_sans_cible_lit_son_sitemap_pour_les_connues_et_ne_saisit_rien(): void
    {
        $this->app->make(RadarCrawlSources::class)->find('expat_dakar')->fill(['scope' => RadarCrawlScope::Targeted])->save();
        $connue = $this->connue(self::ANNONCE.'appartement-connu-9300008');
        $connue->forceFill(['stage' => RadarListingStage::Extracted, 'source_lastmod' => CarbonImmutable::parse('2026-10-01T00:00:00+00:00')])->save();
        $this->sitemaps(['appartements-a-louer' => [
            self::ANNONCE.'appartement-connu-9300008' => '2026-11-03T00:00:00+00:00',
            self::ANNONCE.'appartement-neuf-9300009' => '2026-11-03T00:00:00+00:00',
        ]]);

        $run = $this->crawl();

        $this->assertSame(RadarCrawlRun::STOP_END, $run->stop_reason);
        $this->assertTrue($run->reached_end);
        $this->assertSame(9, $run->pages_read);
        $this->assertNull($this->annonce(self::ANNONCE.'appartement-neuf-9300009'));
        $this->assertSame(1, $run->cards_skipped);
        $this->assertSame(0, $run->listings_created);
        $this->assertSame(1, $connue->snapshots()->count(), 'la connue est observée');
        Bus::assertDispatched(RefreshRadarListing::class, fn (RefreshRadarListing $job) => $job->listingId === $connue->id);
        Bus::assertNotDispatched(ExtractRadarListing::class);
    }

    // ── AC2 ───────────────────────────────────────────────────────────────────────────────────

    public function test_ac2_un_lastmod_qui_avance_fait_relire_la_page_sans_le_modele_et_un_prix_change_ouvre_un_instantane(): void
    {
        RadarExtraction::fake();
        $url = 'https://www.expat-dakar.com/annonce/villa-fictive-f5-avec-piscine-8200001';
        $villa = $this->connue($url);
        $villa->forceFill([
            'stage' => RadarListingStage::Reviewed,
            'raw_text' => 'Texte relu par l\'opérateur.',
            'extracted' => ['relu' => true],
            'source_lastmod' => CarbonImmutable::parse('2026-10-01T00:00:00+00:00'),
            'source_fields' => ['phones' => ['+221775550202'], 'price' => 2_000_000],
        ])->save();
        RadarListingSnapshot::query()->create([
            'radar_listing_id' => $villa->id, 'price' => 2_000_000, 'first_seen_at' => now()->subDay(), 'last_seen_at' => now()->subDay(), 'observations' => 1,
        ]);
        $this->sitemaps(['maisons-a-louer' => [$url => '2026-11-03T12:00:00+00:00']]);

        $run = $this->crawl();

        $this->assertSame(1, $villa->snapshots()->count(), 'Une présence au sitemap ne compare pas de prix : le dernier instantané est prolongé.');
        $this->assertSame(2, (int) $villa->snapshots()->sole()->observations);
        Bus::assertDispatched(RefreshRadarListing::class, fn (RefreshRadarListing $job) => $job->listingId === $villa->id
            && $job->runId === $run->id && $job->lastmod === '2026-11-03T12:00:00+00:00');
        Bus::assertNotDispatched(ExtractRadarListing::class);

        // La relecture : la page dit 2 500 000 (la fixture de TCK-2465).
        $this->served[$url] = [200, 'text/html; charset=utf-8', (string) file_get_contents(base_path('tests/fixtures/radar/expat-dakar-listing.html'))];
        $this->travel(10)->seconds();
        $this->app->call([new RefreshRadarListing($villa->id, $run->id, '2026-11-03T12:00:00+00:00'), 'handle']);

        $villa->refresh();
        RadarExtraction::assertNeverPrompted();
        $this->assertSame(2_500_000, $villa->source_fields['price']);
        $this->assertSame(['+221775550202'], $villa->source_fields['phones']);
        $this->assertSame('2026-11-03 12:00:00', $villa->source_lastmod?->utc()->format('Y-m-d H:i:s'));
        $this->assertSame('Texte relu par l\'opérateur.', $villa->raw_text, 'Jamais ré-extraite : le texte reste.');
        $this->assertSame(['relu' => true], $villa->extracted);
        $this->assertSame(RadarListingStage::Reviewed, $villa->stage);

        $instantanes = $villa->snapshots()->orderBy('first_seen_at')->orderBy('id')->get();
        $this->assertCount(2, $instantanes, 'Le prix a changé : un instantané s\'ouvre.');
        $this->assertSame(2_500_000, (int) $instantanes->last()->price);
        $this->assertSame($run->id, $instantanes->last()->crawl_run_id);

        // Une seconde relecture au même lastmod ne relit rien (hors du délai du domaine : sinon elle serait différée).
        $this->travel(10)->seconds();
        $lectures = count(Http::recorded());
        $this->app->call([new RefreshRadarListing($villa->id, $run->id, '2026-11-03T12:00:00+00:00'), 'handle']);
        $this->assertCount($lectures, Http::recorded());
        $this->assertSame(2, $villa->snapshots()->count());
    }

    public function test_ac2_le_meme_prix_relu_n_ouvre_aucun_instantane(): void
    {
        $url = 'https://www.expat-dakar.com/annonce/villa-fictive-f5-avec-piscine-8200001';
        $villa = $this->connue($url);
        $villa->forceFill(['stage' => RadarListingStage::Extracted, 'source_lastmod' => CarbonImmutable::parse('2026-10-01T00:00:00+00:00')])->save();
        RadarListingSnapshot::query()->create([
            'radar_listing_id' => $villa->id, 'price' => 2_500_000, 'first_seen_at' => now()->subDay(), 'last_seen_at' => now()->subDay(), 'observations' => 1,
        ]);
        $this->served[$url] = [200, 'text/html; charset=utf-8', (string) file_get_contents(base_path('tests/fixtures/radar/expat-dakar-listing.html'))];

        $this->app->call([new RefreshRadarListing($villa->id, null, '2026-11-03T12:00:00+00:00'), 'handle']);

        $this->assertSame(1, $villa->snapshots()->count());
        $this->assertSame(2, (int) $villa->snapshots()->sole()->observations);
        $this->assertSame(2_500_000, $villa->refresh()->source_fields['price']);
    }

    /**
     * Revue de code du 2026-11-04 — une page refusée pour de bon (ici : pas du HTML) ou que l'adaptateur ne reconnaît plus
     * enregistre le `lastmod` vu comme traité : elle ne revient qu'avec un `lastmod` plus récent. Sans cela, chaque passage la
     * remettait en file, en tête (les plus récentes d'abord), sur le créneau du domaine, sans jamais réussir. Un échec
     * passager (ici : 503) la laisse à relire.
     */
    public function test_une_page_refusee_pour_de_bon_n_est_plus_relue_au_meme_lastmod_mais_un_echec_passager_si(): void
    {
        $avant = CarbonImmutable::parse('2026-10-01T00:00:00+00:00');
        $pages = [
            'meconnaissable' => [200, 'text/html; charset=utf-8', '<html><body><p>Page sans annonce.</p></body></html>'],
            'pas-du-html' => [200, 'application/pdf', '%PDF-1.4'],
            'indisponible' => [503, 'text/html', 'indisponible'],
        ];
        $annonces = [];
        foreach ($pages as $cas => $reponse) {
            $url = self::ANNONCE.'villa-'.$cas.'-'.(8300000 + count($annonces));
            $annonce = $this->connue($url);
            $annonce->forceFill(['stage' => RadarListingStage::Extracted, 'source_lastmod' => $avant])->save();
            $this->served[$url] = $reponse;
            $this->travel(10)->seconds();
            $this->app->call([new RefreshRadarListing($annonce->id, null, '2026-11-03T12:00:00+00:00'), 'handle']);
            $annonces[$cas] = [$url, $annonce->refresh()];
        }

        $this->assertSame('2026-11-03 12:00:00', $annonces['meconnaissable'][1]->source_lastmod?->utc()->format('Y-m-d H:i:s'));
        $this->assertSame('2026-11-03 12:00:00', $annonces['pas-du-html'][1]->source_lastmod?->utc()->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-01 00:00:00', $annonces['indisponible'][1]->source_lastmod?->utc()->format('Y-m-d H:i:s'), 'Un échec passager se relira.');
        $this->assertNull($annonces['meconnaissable'][1]->source_fields, 'Rien d\'autre n\'est écrit.');

        // Le passage suivant, au même lastmod : seule la page en échec passager est remise en file.
        $this->sitemaps(['maisons-a-louer' => array_fill_keys(array_column($annonces, 0), '2026-11-03T12:00:00+00:00')]);
        $this->crawl();
        Bus::assertDispatchedTimes(RefreshRadarListing::class, 1);
        Bus::assertDispatched(RefreshRadarListing::class, fn (RefreshRadarListing $job) => $job->listingId === $annonces['indisponible'][1]->id);
    }

    public function test_une_annonce_encore_capturee_ou_purgee_n_est_pas_relue(): void
    {
        $url = 'https://www.expat-dakar.com/annonce/villa-fictive-f5-avec-piscine-8200001';
        $villa = $this->connue($url);
        $this->served[$url] = [200, 'text/html; charset=utf-8', (string) file_get_contents(base_path('tests/fixtures/radar/expat-dakar-listing.html'))];

        $this->app->call([new RefreshRadarListing($villa->id, null, '2026-11-03T12:00:00+00:00'), 'handle']);
        $villa->forceFill(['stage' => RadarListingStage::Purged])->save();
        $this->app->call([new RefreshRadarListing($villa->id, null, '2026-11-03T12:00:00+00:00'), 'handle']);

        Http::assertNothingSent();
        $this->assertNull($villa->refresh()->source_lastmod);
    }

    // ── AC4 ───────────────────────────────────────────────────────────────────────────────────

    public function test_ac4_au_dela_du_plafond_d_urls_neuves_le_reste_attend_le_passage_suivant(): void
    {
        config(['radar.crawl.max_new_per_run' => 2]);
        $this->sitemaps(['appartements-a-louer' => [
            self::ANNONCE.'la-plus-ancienne-9300011' => '2026-10-01T00:00:00+00:00',
            self::ANNONCE.'la-plus-recente-9300012' => '2026-11-03T00:00:00+00:00',
            self::ANNONCE.'la-mediane-9300013' => '2026-10-15T00:00:00+00:00',
        ]]);

        $run = $this->crawl();

        $this->assertSame(2, $run->listings_created);
        $this->assertNotNull($this->annonce(self::ANNONCE.'la-plus-recente-9300012'), 'Les plus récentes d\'abord.');
        $this->assertNotNull($this->annonce(self::ANNONCE.'la-mediane-9300013'));
        $this->assertNull($this->annonce(self::ANNONCE.'la-plus-ancienne-9300011'));
        $this->assertSame(0, $run->cards_skipped, 'Le plafond n\'est pas un écart de cible.');
        $this->assertTrue($run->reached_end, 'Toutes les URL ont été lues : la lecture est complète.');

        // Le passage suivant saisit le reste.
        $this->travel(1)->hours();
        $this->assertSame(1, $this->crawl()->listings_created);
        $this->assertNotNull($this->annonce(self::ANNONCE.'la-plus-ancienne-9300011'));
    }

    /**
     * Revue adverse du 2026-11-04 (D4) — les relectures d'un passage ont un plafond (`radar.crawl.max_refresh_per_run`) :
     * un site qui date toutes ses annonces du jour, ou un premier passage après une longue pause, ne met pas en file une
     * relecture par annonce connue (chacune tient le créneau du domaine). Les `lastmod` les plus récents d'abord ; le reste
     * au passage suivant, puisque sa référence n'a pas avancé.
     */
    public function test_au_dela_du_plafond_de_relectures_les_plus_recentes_d_abord_et_le_reste_au_passage_suivant(): void
    {
        config(['radar.crawl.max_refresh_per_run' => 3]);
        $urls = [];
        foreach (range(1, 5) as $i) {
            $urls[self::ANNONCE.'appartement-connu-'.(9400000 + $i)] = sprintf('2026-11-0%dT00:00:00+00:00', $i);
        }
        $ids = [];
        foreach (array_keys($urls) as $url) {
            $ids[$url] = $this->connue($url)->id;
        }
        RadarListing::query()->whereKey(array_values($ids))->update(['stage' => RadarListingStage::Extracted->value, 'source_lastmod' => '2026-10-01 00:00:00']);
        $this->sitemaps(['appartements-a-louer' => $urls]);

        $run = $this->crawl();

        $relues = [];
        Bus::assertDispatched(RefreshRadarListing::class, function (RefreshRadarListing $job) use (&$relues): bool {
            $relues[] = $job->lastmod;

            return true;
        });
        sort($relues);
        $this->assertSame(['2026-11-03T00:00:00+00:00', '2026-11-04T00:00:00+00:00', '2026-11-05T00:00:00+00:00'], $relues);
        $this->assertTrue($run->reached_end, 'Le plafond ne coupe pas la lecture.');

        // Les trois relectures faites (leur référence avance), le passage suivant relit le reste.
        foreach (array_slice($urls, 2, 3, true) as $url => $lastmod) {
            RadarListing::query()->whereKey($ids[$url])->update(['source_lastmod' => CarbonImmutable::parse($lastmod)]);
        }
        $this->travel(1)->hours();
        $this->crawl();
        $relues = [];
        Bus::assertDispatched(RefreshRadarListing::class, function (RefreshRadarListing $job) use (&$relues): bool {
            $relues[] = $job->lastmod;

            return true;
        });
        sort($relues);
        $this->assertSame(['2026-11-01T00:00:00+00:00', '2026-11-02T00:00:00+00:00'], $relues);
    }

    // ── Les sitemaps refusés ───────────────────────────────────────────────────────────────────

    public function test_un_sitemap_plus_gros_que_max_bytes_est_refuse_et_le_passage_le_dit(): void
    {
        $gros = [];
        for ($i = 0; $i < 40; $i++) {
            $gros[self::ANNONCE.'annonce-volumineuse-'.(9301000 + $i)] = '2026-11-01T00:00:00+00:00';
        }
        $this->sitemaps(['appartements-a-louer' => $gros, 'maisons-a-louer' => [self::ANNONCE.'maison-lue-9300021' => '2026-11-01T00:00:00+00:00']]);
        config(['radar.fetch.max_bytes' => 4_000]);
        $this->assertGreaterThan(4_000, strlen($this->served[self::sitemap('appartements-a-louer')][2]));

        $run = $this->crawl();

        $this->assertSame('radar.fetch.too_large', $run->stop_reason);
        $this->assertFalse($run->reached_end, 'Une lecture coupée : elle ne conclut aucune disparition.');
        $this->assertNull($this->annonce(self::ANNONCE.'annonce-volumineuse-9301000'), 'Jamais tronqué : rien n\'en est lu.');
        $this->assertNotNull($this->annonce(self::ANNONCE.'maison-lue-9300021'), 'Les autres sitemaps sont lus.');
        $this->assertSame(8, $run->pages_read);
    }

    public function test_un_sitemap_avec_une_entite_externe_est_refuse_sans_rien_lire_de_plus(): void
    {
        $this->served[self::sitemap('appartements-a-louer')] = [200, 'application/xml', '<?xml version="1.0"?>'."\n"
            .'<!DOCTYPE urlset [<!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">]>'."\n"
            .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>&xxe;</loc></url>'
            .'<url><loc>'.self::ANNONCE.'apres-l-entite-9300031</loc></url></urlset>'];

        $run = $this->crawl();

        $this->assertSame(RadarCrawler::STOP_SITEMAP_INVALID, $run->stop_reason);
        $this->assertFalse($run->reached_end);
        $this->assertNull($this->annonce(self::ANNONCE.'apres-l-entite-9300031'));
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), '169.254'));
    }

    public function test_une_categorie_inconnue_du_site_repond_200_sans_urlset_et_coupe_la_lecture(): void
    {
        // Relevé du 2026-11-04 : une catégorie inexistante d'Expat-Dakar répond 200, `application/xml`, `<error>`.
        $this->served[self::sitemap('chambres-a-louer')] = [200, 'application/xml; charset=utf-8',
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<error>\n    <code>404</code>\n    <message>Not Found</message>\n</error>\n"];

        $run = $this->crawl();

        $this->assertSame(RadarCrawler::STOP_SITEMAP_INVALID, $run->stop_reason);
        $this->assertFalse($run->reached_end);
    }

    public function test_un_sitemap_vide_ou_qui_n_est_pas_du_xml_coupe_la_lecture(): void
    {
        $this->served[self::sitemap('chambres-a-louer')] = [200, 'application/xml', self::urlset([])];
        $this->assertSame(RadarCrawlRun::STOP_NO_CARDS, $this->crawl()->stop_reason);

        $this->travel(1)->hours();
        $this->served[self::sitemap('chambres-a-louer')] = [200, 'text/html', '<!doctype html><html><body>maintenance</body></html>'];
        $run = $this->crawl();
        $this->assertSame('radar.fetch.not_xml', $run->stop_reason);
        $this->assertFalse($run->reached_end);
    }

    // ── AC3 ───────────────────────────────────────────────────────────────────────────────────

    /** Un premier passage voit A et B ; les suivants ne voient plus que A. */
    private function bDisparaitApresUnPremierPassage(): RadarListing
    {
        $a = self::ANNONCE.'appartement-qui-reste-9300041';
        $b = self::ANNONCE.'appartement-qui-part-9300042';
        $this->sitemaps(['appartements-a-louer' => [$a => '2026-11-01T00:00:00+00:00', $b => '2026-11-01T00:00:00+00:00']]);
        $this->assertTrue($this->crawl()->reached_end);
        $annonce = $this->annonce($b);
        $this->assertNotNull($annonce);

        $this->sitemaps(['appartements-a-louer' => [$a => '2026-11-01T00:00:00+00:00']]);

        return $annonce;
    }

    public function test_ac3_absente_de_deux_lectures_completes_l_annonce_est_disparue(): void
    {
        $b = $this->bDisparaitApresUnPremierPassage();

        $this->travel(1)->hours();
        $this->assertTrue($this->crawl()->reached_end);
        $this->assertSame(0, app(RadarSourceWatch::class)->observe()['gone'], 'Une seule lecture complète ne suffit pas.');

        $this->travel(1)->hours();
        $troisieme = $this->crawl();
        $this->assertTrue($troisieme->reached_end);

        $this->assertSame(1, app(RadarSourceWatch::class)->observe()['gone']);
        $this->assertSame($troisieme->id, $b->refresh()->source_gone_run_id);
        $this->assertNull($this->annonce(self::ANNONCE.'appartement-qui-reste-9300041')->source_gone_at);
    }

    public function test_ac3_absente_d_une_lecture_coupee_l_annonce_n_est_pas_disparue(): void
    {
        $b = $this->bDisparaitApresUnPremierPassage();

        $this->travel(1)->hours();
        $this->assertTrue($this->crawl()->reached_end);

        $this->travel(1)->hours();
        $this->served[self::sitemap('terrains-a-vendre')] = [500, 'text/html', 'erreur'];
        $coupee = $this->crawl();
        $this->assertFalse($coupee->reached_end);

        $this->assertSame(0, app(RadarSourceWatch::class)->observe()['gone']);
        $this->assertNull($b->refresh()->source_gone_at);
    }
}
