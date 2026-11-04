<?php

namespace App\Services\Radar\Crawl;

use App\Jobs\Radar\RefreshRadarListing;
use App\Models\Enums\RadarCrawlDiscovery;
use App\Models\Enums\RadarCrawlScope;
use App\Models\Enums\RadarCrawlStatus;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarCrawlRun;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Radar\Exceptions\RadarFetchDeferred;
use App\Services\Radar\Exceptions\RadarFetchRefused;
use App\Services\Radar\FetchedPage;
use App\Services\Radar\RadarListingIntake;
use App\Services\Radar\Targets\RadarTargetMatcher;
use App\Services\Radar\UrlFetcher;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Sleep;

/**
 * TCK-2392 (ADR-0077 §10, AC1, AC5) — un passage de collecte sur un site.
 *
 * Liste après liste, à partir de chaque URL de départ de la source (TCK-2438, `RadarStartUrls::forRun()` : celles de la
 * console qui passent ses garde-fous, à défaut `startUrl()` de l'adaptateur), et page après page dans chaque liste, au plus
 * `max_pages` de la source pour le passage ENTIER :
 *  1. **la page est lue par `UrlFetcher`**, comme une URL saisie : SSRF contrôlée à chaque saut, `robots.txt` respecté,
 *     créneau par domaine. Le créneau pris (une extraction lit une annonce du même site) → le passage attend ce qu'il
 *     faut, au plus `radar.crawl.busy_waits` fois, puis s'arrête (`radar.crawl.domain_busy`). Une lecture refusée arrête
 *     le passage sur son code (`radar.fetch.robots`…) : il ne force jamais ;
 *  2. **l'adaptateur en tire les cartes** ; une page sans carte arrête le passage (`radar.crawl.no_cards` : la structure
 *     du site a pu changer — le journal le dit) ;
 *  3. **chaque URL nouvelle devient une annonce** par la saisie du lot 1 (`RadarListingIntake::fromUrls()`, au nom de
 *     l'opérateur du passage, l'extraction en file `ai`) ; une URL déjà connue — même purgée, même en échec — ne crée rien
 *     et ne relance rien ;
 *  4. **chaque annonce vue est observée** (`RadarSnapshots`) : un prix changé ouvre un instantané — SAUF une annonce
 *     purgée ou `do_not_contact`, ou dont l'annonceur a dit STOP (`do_not_contact_at`) : elle n'est ni observée ni
 *     comptée. La promesse de `privacy.ts` § 6 (« ne subsiste qu'une empreinte chiffrée de votre numéro ») vaut aussi
 *     pour ce qu'un passage relirait après coup (ADR-0077 §9, ADR-0080).
 *
 * Les compteurs sont écrits après chaque page : un passage interrompu laisse ce qu'il a fait. Le plafond de pages, le
 * budget de temps et le créneau du domaine pris arrêtent le PASSAGE. La fin d'une liste, une page sans carte, une lecture
 * refusée ou une pagination qui renvoie vers une page déjà lue (`radar.crawl.loop`) n'arrêtent que la LISTE : la suivante
 * est lue. Une liste qui rejoint une page déjà lue par une liste précédente s'arrête là, sur sa fin : la suite a été lue,
 * et l'arrêt de l'autre liste compte. `reached_end` n'est vrai que si chaque liste est allée jusqu'au bout, quel que soit
 * l'ordre des URL ; sinon l'arrêt du passage est celui de la première liste qui ne l'a pas fait (une boucle se lit dans
 * la console : `radar.crawl.loop`). Un passage que le planificateur a clos entre-temps (`radar.crawl.lost`) le
 * reste : la fin ne réécrit qu'un passage encore `running`.
 *
 * TCK-2468 (ADR-0087 §5) — **une source ciblée** (`scope = targeted`, le défaut) ne saisit une URL nouvelle que si sa
 * carte PEUT correspondre à une cible active qui concerne le site ({@see RadarTargetMatcher::mayMatchCard()}, permissif :
 * une valeur absente de la carte n'exclut rien). Une carte écartée ne crée aucune ligne et n'est comptée que dans
 * `cards_skipped` ; une annonce déjà connue est observée comme avant. Sans aucune cible active pour le site, le passage
 * s'arrête avant de lire (`radar.crawl.no_target`). Les cibles sont lues une fois, au départ du passage. Une source `all`
 * garde le comportement d'ADR-0080.
 *
 * TCK-2467 (ADR-0087 §4) — **une source réglée `sitemap`** ({@see RadarCrawlDiscovery::effective()} : le défaut d'un
 * adaptateur qui en déclare) ne lit pas de listes mais les sitemaps que son adaptateur déclare
 * (`RadarSiteAdapter::sitemapUrls()`), chacun par `UrlFetcher::fetchXml()` (mêmes protections ; plus gros que
 * `max_bytes`, il est refusé et le passage le dit : `radar.fetch.too_large`) et lu par {@see RadarSitemapReader} (ni
 * réseau ni entité). Le périmètre du passage (`start_urls`) est la liste triée de ces sitemaps ; `max_pages` ne s'y
 * applique pas (le nombre de sitemaps est celui que le code déclare), le budget de temps et le créneau du domaine si.
 * Puis, pour chaque URL lue ({@see self::sitemapRun()}) :
 *  - **connue** : observée comme une PRÉSENCE (`RadarSnapshots::present()` — le sitemap ne dit pas le prix) ; si son
 *    `lastmod` est plus récent que la dernière lecture (`source_lastmod`, à défaut la saisie), la page est relue par
 *    `RefreshRadarListing`, sans IA, mis en file à la fin du passage ; sinon le `lastmod` devient sa référence ;
 *  - **neuve** : la catégorie du sitemap fait la carte (type, contrat) pour le filtre des cibles, puis la saisie,
 *    les plus récentes d'abord, au plus `radar.crawl.max_new_per_run` par passage — le reste attend le passage suivant ;
 *  - réduite au silence ({@see RadarSnapshots::silenced()}) : ni observée, ni relue, ni comptée.
 * `reached_end` n'est vrai que si chaque sitemap a été lu et analysé, et porte au moins une URL : un sitemap refusé,
 * illisible (`radar.crawl.sitemap_invalid`) ou vide (`radar.crawl.no_cards`) fait du passage une lecture coupée, qui ne
 * conclut aucune disparition (ADR-0083, `RadarSourceWatch`). Le plafond d'URL neuves ne coupe pas la lecture : les
 * URL écartées par lui ne sont pas des annonces, et toutes les connues ont été vues.
 */
final class RadarCrawler
{
    public const STOP_TIME_BUDGET = 'radar.crawl.time_budget';

    /** TCK-2467 — un sitemap refusé à l'analyse : DTD ou entité, XML mal formé, racine autre que `<urlset>`. */
    public const STOP_SITEMAP_INVALID = 'radar.crawl.sitemap_invalid';

    public function __construct(
        private readonly RadarCrawlSources $sources,
        private readonly UrlFetcher $fetcher,
        private readonly RadarListingIntake $intake,
        private readonly RadarSnapshots $snapshots,
        private readonly RadarStartUrls $startUrls,
        private readonly RadarTargetMatcher $targets,
    ) {}

    /** TCK-2468 — le passage en cours lit-il pour des cibles (source `targeted`) ? */
    private bool $targeted = false;

    public function run(RadarCrawlRun $run): RadarCrawlRun
    {
        // Seul un passage `queued` démarre : un job relivré ne rejoue pas un passage déjà commencé ou clos.
        $started = RadarCrawlRun::query()->whereKey($run->id)->where('status', RadarCrawlStatus::Queued->value)
            ->update(['status' => RadarCrawlStatus::Running->value, 'started_at' => now(), 'updated_at' => now()]);
        $run->refresh();
        if ($started !== 1) {
            return $run;
        }

        $operator = $run->operator;
        if ($operator === null) {
            return $this->finish($run, RadarCrawlRun::STOP_NO_OPERATOR);
        }

        $source = $this->sources->find($run->site->value);
        $adapter = $this->sources->adapter($run->site);
        $maxPages = max(1, min((int) ($source->max_pages ?? config('radar.crawl.default_max_pages', 5)), (int) config('radar.crawl.max_pages_limit', 20)));
        $deadline = now()->addSeconds((int) config('radar.crawl.time_budget_seconds', 1200));

        // TCK-2438 — les listes de la console, rejugées ici (une valeur écrite hors de la console n'est jamais lue), ou
        // l'URL de la configuration. Le passage note l'ensemble qu'il suit, trié : c'est son périmètre, pour l'observatoire.
        // TCK-2467 — une source `sitemap` suit les sitemaps de son adaptateur, et eux seuls.
        $bySitemap = RadarCrawlDiscovery::effective($source?->discovery, $adapter) === RadarCrawlDiscovery::Sitemap;
        $starts = $bySitemap ? self::sitemapsOf($adapter) : $this->startUrls->forRun($source, $adapter);
        $run->start_urls = RadarStartUrls::perimeter($starts);
        $run->save();
        if ($starts === []) {
            return $this->finish($run, RadarCrawlRun::STOP_NO_START_URL);
        }

        // TCK-2468 — les cibles du moment, lues une fois ; une source ciblée sans cible ne lit rien.
        $this->targets->forget();
        $this->targeted = ($source->scope ?? RadarCrawlScope::Targeted) === RadarCrawlScope::Targeted;
        if ($this->targeted && $this->targets->activeFor($run->site)->isEmpty()) {
            return $this->finish($run, RadarCrawlRun::STOP_NO_TARGET);
        }

        if ($bySitemap) {
            return $this->sitemapRun($starts, $run, $operator, $adapter, $deadline);
        }

        $walk = new CrawlWalk($maxPages, $deadline);
        /** @var string|null $listStop le premier arrêt d'une liste avant sa fin ; null tant que chaque liste est allée au bout */
        $listStop = null;

        foreach ($starts as $start) {
            if (isset($walk->visited[$start])) {
                // Déjà lue par la pagination d'une liste précédente : sa suite l'a été aussi.
                continue;
            }

            $stop = $this->walk($start, $run, $operator, $adapter, $walk);
            if (in_array($stop, [RadarCrawlRun::STOP_MAX_PAGES, self::STOP_TIME_BUDGET, RadarCrawlRun::STOP_BUSY], true)) {
                // Le budget du passage est épuisé, ou le domaine est pris : aucune liste suivante n'est lue.
                return $this->finish($run, $stop);
            }
            if ($stop !== RadarCrawlRun::STOP_END) {
                $listStop ??= $stop;
            }
        }

        if ($listStop !== null) {
            return $this->finish($run, $listStop);
        }
        $run->reached_end = true;
        $run->save();

        return $this->finish($run, RadarCrawlRun::STOP_END);
    }

    /**
     * Une liste, de sa page de départ à sa fin, dans le budget du passage. Rend le code qui l'arrête : la fin
     * (`STOP_END`), un arrêt de la liste (boucle, page sans carte, lecture refusée), ou un arrêt du passage (plafond de
     * pages, budget de temps, domaine pris).
     */
    private function walk(string $url, RadarCrawlRun $run, User $operator, RadarSiteAdapter $adapter, CrawlWalk $walk): string
    {
        /** @var array<string, true> $own les pages lues par CETTE liste */
        $own = [];
        while (true) {
            if ($run->pages_read >= $walk->maxPages) {
                return RadarCrawlRun::STOP_MAX_PAGES;
            }
            if (now()->greaterThanOrEqualTo($walk->deadline)) {
                return self::STOP_TIME_BUDGET;
            }
            if (isset($own[$url])) {
                return RadarCrawlRun::STOP_LOOP;
            }
            if (isset($walk->visited[$url])) {
                // TCK-2438 (M2) — la suite d'une liste PRÉCÉDENTE : elle a été lue par elle, et son arrêt compte déjà. Ce
                // n'est pas une boucle ; sans cela, `reached_end` dépendait de l'ordre des URL d'un même périmètre.
                return RadarCrawlRun::STOP_END;
            }

            $page = $this->read($url);
            if (is_string($page)) {
                return $page;
            }
            $walk->visited[$url] = $walk->visited[$page->url] = true;
            $own[$url] = $own[$page->url] = true;

            $list = $adapter->parse($page->body, $page->url);
            $run->pages_read++;
            if ($list->cards === []) {
                $run->save();

                return RadarCrawlRun::STOP_NO_CARDS;
            }

            foreach ($list->cards as $card) {
                $run->cards_seen++;
                $listing = $this->listingFor($card, $run, $operator);
                if ($listing === null || isset($walk->seen[$listing->id])) {
                    continue;
                }
                $walk->seen[$listing->id] = true;
                if ($this->snapshots->observe($listing, $card, $run, now())) {
                    $run->snapshots_opened++;
                }
            }
            $run->save();

            if ($list->nextUrl === null) {
                return RadarCrawlRun::STOP_END;
            }
            $url = $list->nextUrl;
        }
    }

    /** La page lue (un sitemap : `$xml`), ou le code qui arrête le passage. */
    private function read(string $url, bool $xml = false): FetchedPage|string
    {
        $waits = max(0, (int) config('radar.crawl.busy_waits', 6));
        for ($attempt = 0; ; $attempt++) {
            try {
                return $xml ? $this->fetcher->fetchXml($url) : $this->fetcher->fetch($url);
            } catch (RadarFetchRefused $e) {
                return $e->code;
            } catch (RadarFetchDeferred $e) {
                if ($attempt >= $waits) {
                    return RadarCrawlRun::STOP_BUSY;
                }
                Sleep::for($e->retryAfterSeconds)->seconds();
            }
        }
    }

    /**
     * L'annonce de cette carte : la fiche connue (rien n'est relancé), ou une fiche neuve saisie au nom de l'opérateur ;
     * null pour une fiche réduite au silence ({@see RadarSnapshots::silenced()}), qui n'est ni observée ni comptée, et
     * pour une carte nouvelle qu'une source ciblée écarte (TCK-2468, comptée dans `cards_skipped`).
     */
    private function listingFor(ListCard $card, RadarCrawlRun $run, User $operator): ?RadarListing
    {
        $canonical = RadarListingIntake::canonicalUrl($card->url) ?? $card->url;
        $known = RadarListing::query()->where('content_fingerprint', RadarListingIntake::urlFingerprint($canonical))->first();
        if ($known !== null) {
            if (RadarSnapshots::silenced($known)) {
                return null;
            }
            $run->listings_known++;

            return $known;
        }

        // TCK-2468 — une source ciblée ne saisit pas une carte qu'aucune cible active ne peut vouloir : ni ligne, ni coût.
        if ($this->targeted && ! $this->targets->mayMatchCard($card, $run->site)) {
            $run->cards_skipped++;

            return null;
        }

        $result = $this->intake->fromUrls([$card->url], $operator, $run->id)[0];
        $result['existing'] ? $run->listings_known++ : $run->listings_created++;

        return $result['listing'];
    }

    /**
     * TCK-2467 — les sitemaps de l'adaptateur, sous leur forme canonique, sans doublon, dans l'ordre déclaré. Un sitemap
     * qui ne serait pas `https` sur un hôte de `startHosts()` n'est pas lu (une déclaration fautive du code, pas une
     * saisie : elle ne doit pas ouvrir d'autre hôte).
     *
     * @return list<string>
     */
    private static function sitemapsOf(RadarSiteAdapter $adapter): array
    {
        $hosts = array_map('strtolower', $adapter->startHosts());
        $urls = [];
        foreach ($adapter->sitemapUrls() as $url) {
            $host = strtolower((string) parse_url($url, PHP_URL_HOST));
            if (str_starts_with($url, 'https://') && in_array($host, $hosts, true)) {
                $urls[RadarStartUrls::canonical($url)] = true;
            }
        }

        return array_keys($urls);
    }

    /**
     * TCK-2467 — un passage par sitemap : lire chaque sitemap, puis traiter les URL lues (connues d'abord, puis neuves, les
     * plus récentes d'abord). Les compteurs sont écrits après chaque sitemap, puis par lots.
     *
     * @param  list<string>  $sitemaps
     */
    private function sitemapRun(array $sitemaps, RadarCrawlRun $run, User $operator, RadarSiteAdapter $adapter, CarbonInterface $deadline): RadarCrawlRun
    {
        /** @var array<string, array{0: SitemapEntry, 1: array{type: ?string, contract: ?string}}> $entries URL canonique → entrée, catégorie */
        $entries = [];
        $stop = null;

        foreach ($sitemaps as $sitemap) {
            if (now()->greaterThanOrEqualTo($deadline)) {
                return $this->finish($run, self::STOP_TIME_BUDGET);
            }
            $page = $this->read($sitemap, xml: true);
            if ($page === RadarCrawlRun::STOP_BUSY) {
                return $this->finish($run, RadarCrawlRun::STOP_BUSY);
            }
            if (is_string($page)) {
                $stop ??= $page;

                continue;
            }

            $run->pages_read++;
            $read = RadarSitemapReader::parse($page->body, $page->url);
            if ($read === null || $read === []) {
                $stop ??= $read === null ? self::STOP_SITEMAP_INVALID : RadarCrawlRun::STOP_NO_CARDS;
                $run->save();

                continue;
            }
            $category = $adapter->sitemapCategory($sitemap);
            foreach ($read as $entry) {
                $canonical = RadarListingIntake::canonicalUrl($entry->url) ?? $entry->url;
                // Une annonce de deux catégories garde la première, et sa date la plus récente.
                if (! isset($entries[$canonical]) || ($entry->lastmod !== null && $entry->lastmod->greaterThan($entries[$canonical][0]->lastmod ?? $entry->lastmod->subSecond()))) {
                    $entries[$canonical] = [$entry, $entries[$canonical][1] ?? $category];
                }
            }
            $run->save();
        }

        $refresh = [];
        $stop = $this->sitemapEntries($entries, $run, $operator, $deadline, $refresh) ?? $stop;

        // Les relectures partent APRÈS la lecture des sitemaps : elles prennent le créneau du même domaine.
        foreach ($refresh as $listingId => $lastmod) {
            RefreshRadarListing::dispatch($listingId, $run->id, $lastmod);
        }

        if ($stop !== null) {
            return $this->finish($run, $stop);
        }
        $run->reached_end = true;
        $run->save();

        return $this->finish($run, RadarCrawlRun::STOP_END);
    }

    /**
     * TCK-2467 — les URL lues : connues observées (et relues si leur `lastmod` avance), neuves saisies sous le filtre des
     * cibles et le plafond. Rend `STOP_TIME_BUDGET` si le budget de temps a coupé le traitement, null sinon.
     *
     * @param  array<string, array{0: SitemapEntry, 1: array{type: ?string, contract: ?string}}>  $entries
     * @param  array<int, string>  $refresh  rempli : id de l'annonce → `lastmod` ISO 8601 qui la fait relire
     */
    private function sitemapEntries(array $entries, RadarCrawlRun $run, User $operator, CarbonInterface $deadline, array &$refresh): ?string
    {
        $run->cards_seen += count($entries);
        $known = $this->knownListings(array_keys($entries));
        $now = now();
        $done = 0;
        $tick = function () use ($run, &$done): void {
            if (++$done % 200 === 0) {
                $run->save();
            }
        };

        /** @var list<string> $new */
        $new = [];
        foreach ($entries as $url => [$entry, $category]) {
            if (now()->greaterThanOrEqualTo($deadline)) {
                $run->save();

                return self::STOP_TIME_BUDGET;
            }
            $listing = $known[$url] ?? null;
            if ($listing === null) {
                $new[] = $url;

                continue;
            }
            if (RadarSnapshots::silenced($listing)) {
                continue;
            }
            $run->listings_known++;
            if ($this->snapshots->present($listing, self::card($entry, $category), $run, $now)) {
                $run->snapshots_opened++;
            }
            $this->followLastmod($listing, $entry->lastmod, $refresh);
            $tick();
        }

        // Les plus récentes d'abord (sans date : à la fin), à date égale dans l'ordre des sitemaps.
        $order = array_flip($new);
        usort($new, fn (string $a, string $b) => ($entries[$b][0]->lastmod?->getTimestamp() ?? PHP_INT_MIN) <=> ($entries[$a][0]->lastmod?->getTimestamp() ?? PHP_INT_MIN)
            ?: $order[$a] <=> $order[$b]);

        $cap = max(0, (int) config('radar.crawl.max_new_per_run', 200));
        foreach ($new as $url) {
            if ($run->listings_created >= $cap) {
                // Le reste attend le passage suivant : ni ligne, ni compte (ce n'est pas un écart de cible).
                break;
            }
            if (now()->greaterThanOrEqualTo($deadline)) {
                $run->save();

                return self::STOP_TIME_BUDGET;
            }
            [$entry, $category] = $entries[$url];
            $card = self::card($entry, $category);
            if ($this->targeted && ! $this->targets->mayMatchCard($card, $run->site)) {
                $run->cards_skipped++;

                continue;
            }

            $result = $this->intake->fromUrls([$entry->url], $operator, $run->id)[0];
            $result['existing'] ? $run->listings_known++ : $run->listings_created++;
            $listing = $result['listing'];
            if ($result['existing'] && RadarSnapshots::silenced($listing)) {
                continue;
            }
            if (! $result['existing'] && $entry->lastmod !== null) {
                // La saisie fait lire la page par l'extraction : ce `lastmod` est celui qu'elle lira.
                RadarListing::query()->whereKey($listing->id)->update(['source_lastmod' => $entry->lastmod]);
            }
            if ($this->snapshots->present($listing, $card, $run, $now)) {
                $run->snapshots_opened++;
            }
            $tick();
        }
        $run->save();

        return null;
    }

    /**
     * Les annonces déjà connues parmi ces URL canoniques, par URL — une requête par lot de 500.
     *
     * @param  list<string>  $urls
     * @return array<string, RadarListing>
     */
    private function knownListings(array $urls): array
    {
        $byFingerprint = [];
        foreach ($urls as $url) {
            $byFingerprint[RadarListingIntake::urlFingerprint($url)] = $url;
        }

        $known = [];
        foreach (array_chunk(array_keys($byFingerprint), 500) as $chunk) {
            RadarListing::query()
                ->whereIn('content_fingerprint', $chunk)
                ->get(['id', 'content_fingerprint', 'stage', 'radar_advertiser_id', 'extracted', 'source_lastmod', 'created_at'])
                ->each(function (RadarListing $listing) use ($byFingerprint, &$known): void {
                    $known[$byFingerprint[$listing->content_fingerprint]] = $listing;
                });
        }

        return $known;
    }

    /**
     * Un `lastmod` plus récent que la dernière lecture de la page (`source_lastmod`, à défaut la saisie : une annonce
     * saisie par les listes n'a jamais été vue dans un sitemap) la fait relire ; sinon il devient la référence. Une
     * annonce encore `captured` n'est pas relue : son extraction lira la page.
     *
     * @param  array<int, string>  $refresh
     */
    private function followLastmod(RadarListing $listing, ?CarbonImmutable $lastmod, array &$refresh): void
    {
        if ($lastmod === null) {
            return;
        }
        $baseline = $listing->source_lastmod ?? $listing->created_at;
        if ($baseline === null || $lastmod->greaterThan($baseline)) {
            if ($listing->stage !== RadarListingStage::Captured) {
                $refresh[$listing->id] = $lastmod->toIso8601String();
            }

            return;
        }
        if ($listing->source_lastmod === null) {
            RadarListing::query()->whereKey($listing->id)->whereNull('source_lastmod')->update(['source_lastmod' => $lastmod]);
        }
    }

    /**
     * La carte d'une URL de sitemap : ce que sa catégorie dit (type, contrat), rien d'autre.
     *
     * @param  array{type: ?string, contract: ?string}  $category
     */
    private static function card(SitemapEntry $entry, array $category): ListCard
    {
        return new ListCard(url: $entry->url, contract: $category['contract'], propertyType: $category['type']);
    }

    private function finish(RadarCrawlRun $run, string $reason): RadarCrawlRun
    {
        RadarCrawlRun::query()->whereKey($run->id)->where('status', RadarCrawlStatus::Running->value)->update([
            'status' => RadarCrawlStatus::Finished->value,
            'finished_at' => now(),
            'stop_reason' => $reason,
            'updated_at' => now(),
        ]);

        return $run->refresh();
    }
}
