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
 * Page après page, à partir de `startUrl()` de l'adaptateur, au plus `max_pages` de la source :
 *  1. **la page est lue par `UrlFetcher`**, comme une URL saisie : SSRF contrôlée à chaque saut, `robots.txt` respecté,
 *     créneau par domaine. Le créneau pris (une extraction lit une annonce du même site) → le passage attend ce qu'il
 *     faut, au plus `radar.crawl.busy_waits` fois, puis s'arrête (`radar.crawl.domain_busy`). Une lecture refusée arrête
 *     le passage sur son code (`radar.fetch.robots`…) : il ne force jamais ;
 *  2. **l'adaptateur en tire les cartes** ; une page sans carte arrête le passage (`radar.crawl.no_cards` : la structure
 *     du site a pu changer — le journal le dit) ;
 *  3. **chaque URL nouvelle devient une annonce** par la saisie du lot 1 (`RadarListingIntake::fromUrls()`, au nom de
 *     l'opérateur du passage, l'extraction en file `ai`) ; une URL déjà connue — même purgée, même en échec — ne crée rien
 *     et ne relance rien ;
 *  4. **chaque annonce vue est observée** (`RadarSnapshots`) : un prix changé ouvre un instantané.
 *
 * Les compteurs sont écrits après chaque page : un passage interrompu laisse ce qu'il a fait. Le passage s'arrête aussi
 * sur la fin de la liste (`reached_end`), le plafond de pages ou son budget de temps.
 */
final class RadarCrawler
{
    public const STOP_TIME_BUDGET = 'radar.crawl.time_budget';

    public function __construct(
        private readonly RadarCrawlSources $sources,
        private readonly UrlFetcher $fetcher,
        private readonly RadarListingIntake $intake,
        private readonly RadarSnapshots $snapshots,
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

        $url = $adapter->startUrl();
        /** @var array<int, true> $seen les annonces déjà observées par ce passage */
        $seen = [];

        while (true) {
            if ($run->pages_read >= $maxPages) {
                return $this->finish($run, RadarCrawlRun::STOP_MAX_PAGES);
            }
            if (now()->greaterThanOrEqualTo($deadline)) {
                return $this->finish($run, self::STOP_TIME_BUDGET);
            }

            $page = $this->read($url);
            if (is_string($page)) {
                return $this->finish($run, $page);
            }

            $list = $adapter->parse($page->body, $page->url);
            $run->pages_read++;
            if ($list->cards === []) {
                $run->save();

                return $this->finish($run, RadarCrawlRun::STOP_NO_CARDS);
            }

            foreach ($list->cards as $card) {
                $run->cards_seen++;
                $listing = $this->listingFor($card, $run, $operator);
                if (isset($seen[$listing->id])) {
                    continue;
                }
                $seen[$listing->id] = true;
                if ($this->snapshots->observe($listing, $card, $run, now())) {
                    $run->snapshots_opened++;
                }
            }
            $run->save();

            if ($list->nextUrl === null) {
                $run->reached_end = true;

                return $this->finish($run, RadarCrawlRun::STOP_END);
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

    /** L'annonce de cette carte : la fiche connue (rien n'est relancé), ou une fiche neuve saisie au nom de l'opérateur. */
    private function listingFor(ListCard $card, RadarCrawlRun $run, User $operator): RadarListing
    {
        $canonical = RadarListingIntake::canonicalUrl($card->url) ?? $card->url;
        $known = RadarListing::query()->where('content_fingerprint', RadarListingIntake::urlFingerprint($canonical))->first();
        if ($known !== null) {
            $run->listings_known++;

            return $known;
        }

        $result = $this->intake->fromUrls([$card->url], $operator, $run->id)[0];
        $result['existing'] ? $run->listings_known++ : $run->listings_created++;

        return $result['listing'];
    }

    private function finish(RadarCrawlRun $run, string $reason): RadarCrawlRun
    {
        $run->fill([
            'status' => RadarCrawlStatus::Finished,
            'finished_at' => now(),
            'stop_reason' => $reason,
        ])->save();

        return $run;
    }
}
