<?php

namespace App\Services\Radar\Crawl;

use App\Models\Enums\RadarCrawlStatus;
use App\Models\RadarCrawlRun;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Radar\Exceptions\RadarFetchDeferred;
use App\Services\Radar\Exceptions\RadarFetchRefused;
use App\Services\Radar\FetchedPage;
use App\Services\Radar\RadarListingIntake;
use App\Services\Radar\UrlFetcher;
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
 * est lue. `reached_end` n'est vrai que si chaque liste est allée jusqu'au bout ; sinon l'arrêt du passage est celui de
 * la première liste qui ne l'a pas fait. Un passage que le planificateur a clos entre-temps (`radar.crawl.lost`) le
 * reste : la fin ne réécrit qu'un passage encore `running`.
 */
final class RadarCrawler
{
    public const STOP_TIME_BUDGET = 'radar.crawl.time_budget';

    public function __construct(
        private readonly RadarCrawlSources $sources,
        private readonly UrlFetcher $fetcher,
        private readonly RadarListingIntake $intake,
        private readonly RadarSnapshots $snapshots,
        private readonly RadarStartUrls $startUrls,
    ) {}

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
        // l'URL de la configuration. Le passage note celles qu'il lit : c'est son périmètre, pour l'observatoire.
        $starts = $this->startUrls->forRun($source, $adapter);
        $run->start_urls = $starts['configured'] ? $starts['urls'] : null;
        $run->save();
        if ($starts['urls'] === []) {
            return $this->finish($run, RadarCrawlRun::STOP_NO_START_URL);
        }

        $walk = new CrawlWalk($maxPages, $deadline);
        /** @var string|null $listStop le premier arrêt d'une liste avant sa fin ; null tant que chaque liste est allée au bout */
        $listStop = null;

        foreach ($starts['urls'] as $start) {
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
        while (true) {
            if ($run->pages_read >= $walk->maxPages) {
                return RadarCrawlRun::STOP_MAX_PAGES;
            }
            if (now()->greaterThanOrEqualTo($walk->deadline)) {
                return self::STOP_TIME_BUDGET;
            }
            if (isset($walk->visited[$url])) {
                return RadarCrawlRun::STOP_LOOP;
            }

            $page = $this->read($url);
            if (is_string($page)) {
                return $page;
            }
            $walk->visited[$url] = true;
            $walk->visited[$page->url] = true;

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

    /** La page lue, ou le code qui arrête le passage. */
    private function read(string $url): FetchedPage|string
    {
        $waits = max(0, (int) config('radar.crawl.busy_waits', 6));
        for ($attempt = 0; ; $attempt++) {
            try {
                return $this->fetcher->fetch($url);
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
     * null pour une fiche réduite au silence ({@see RadarSnapshots::silenced()}), qui n'est ni observée ni comptée.
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

        $result = $this->intake->fromUrls([$card->url], $operator, $run->id)[0];
        $result['existing'] ? $run->listings_known++ : $run->listings_created++;

        return $result['listing'];
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
