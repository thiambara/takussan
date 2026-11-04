<?php

namespace App\Jobs\Radar;

use App\Models\Enums\RadarListingStage;
use App\Models\RadarCrawlRun;
use App\Models\RadarListing;
use App\Services\Radar\Crawl\ListCard;
use App\Services\Radar\Crawl\RadarCrawlSources;
use App\Services\Radar\Crawl\RadarSnapshots;
use App\Services\Radar\Exceptions\RadarFetchDeferred;
use App\Services\Radar\Exceptions\RadarFetchRefused;
use App\Services\Radar\RadarAdvertiserDirectory;
use App\Services\Radar\UrlFetcher;
use App\Support\RadarPhone;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * TCK-2467 (ADR-0087 §4) — la relecture d'une annonce déjà connue dont le sitemap du site annonce une modification
 * (`<lastmod>` plus récent que `radar_listings.source_lastmod`), mise en file par `RadarCrawler` à la fin d'un passage.
 *
 * **Sans IA, jamais.** La page est lue par `UrlFetcher` (SSRF, `robots.txt`, créneau du domaine) et par l'adaptateur de
 * son site (`parseListing()`) ; seuls changent `source_fields` (ce que la page dit en clair), `source_lastmod` et les
 * instantanés : le prix lu est observé (`RadarSnapshots::observe()`), un prix changé ouvre un instantané. Ni `raw_text`,
 * ni `extracted`, ni `photo_urls`, ni l'étape ne sont touchés : une annonce relue ou publiée n'est jamais ré-extraite.
 * Le titre n'est pas comparé : celui d'une carte de liste et celui de la page ne s'écrivent pas pareil, et ce n'est pas
 * un changement de l'annonce.
 *
 * Rien n'est écrit pour une annonce réduite au silence (`RadarSnapshots::silenced()`, relu sous verrou), ni pour une
 * annonce encore `captured` (son extraction lit la page), ni quand la page est refusée ou méconnaissable : `source_lastmod`
 * ne bouge pas, et le passage suivant la relira. Un numéro de la page qui a dit STOP n'est pas gardé dans `source_fields`.
 *
 * Un exemplaire par annonce (`ShouldBeUnique`) ; la lecture différée (domaine pris) relâche du délai demandé.
 * ADR-0078 : `$timeout` + 5 s ≤ `retry_after` de `database` (90 s).
 */
final class RefreshRadarListing implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public const WINDOW_SECONDS = 6 * 3600;

    public const BACKOFF_SECONDS = [10, 60, 300];

    public int $timeout = 85;

    public bool $failOnTimeout = false;

    public int $uniqueFor = self::WINDOW_SECONDS;

    public function __construct(
        public readonly int $listingId,
        public readonly ?int $runId = null,
        public readonly ?string $lastmod = null,
    ) {}

    public function uniqueId(): string
    {
        return (string) $this->listingId;
    }

    public function retryUntil(): DateTimeInterface
    {
        return now()->addSeconds(self::WINDOW_SECONDS);
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return self::BACKOFF_SECONDS;
    }

    /** @return list<object> */
    public function middleware(): array
    {
        return [(new WithoutOverlapping((string) $this->listingId))->releaseAfter(30)->expireAfter($this->timeout + 30)];
    }

    public function handle(RadarCrawlSources $sources, UrlFetcher $fetcher, RadarSnapshots $snapshots, RadarAdvertiserDirectory $directory): void
    {
        $listing = RadarListing::query()->find($this->listingId);
        if ($listing === null || $listing->stage === RadarListingStage::Captured || RadarSnapshots::silenced($listing)) {
            return;
        }
        $lastmod = $this->lastmodDate();
        if ($lastmod !== null && $listing->source_lastmod !== null && ! $lastmod->greaterThan($listing->source_lastmod)) {
            // Déjà relue à cette date (un passage plus récent l'a remise en file).
            return;
        }
        $adapter = $sources->adapterFor($listing->source_site);
        if ($adapter === null || $listing->source_url === null) {
            return;
        }

        try {
            $page = $fetcher->fetch((string) $listing->source_url);
        } catch (RadarFetchDeferred $e) {
            $this->release($e->retryAfterSeconds);

            return;
        } catch (RadarFetchRefused) {
            return;
        }

        $read = $adapter->parseListing($page->body, $page->url);
        if ($read === null) {
            return;
        }

        $fields = $read->sourceFields();
        $fields['phones'] = array_values(array_filter(
            $read->phones,
            fn (string $phone) => ($e164 = RadarPhone::canonical($phone)) !== null && $directory->refusedAmong([$e164]) === null,
        ));

        $written = DB::transaction(function () use ($fields, $lastmod): bool {
            $locked = RadarListing::query()->whereKey($this->listingId)->lockForUpdate()->first();
            if ($locked === null || $locked->stage === RadarListingStage::Captured || RadarSnapshots::silenced($locked)) {
                return false;
            }
            $locked->forceFill(['source_fields' => $fields, 'source_lastmod' => $lastmod ?? now()])->save();

            return true;
        });
        if (! $written) {
            return;
        }

        $card = new ListCard(
            url: (string) $listing->source_url,
            price: $read->price,
            rentPeriod: $read->rentPeriod,
            contract: $read->contract,
            propertyType: $read->propertyType,
            surfaceM2: $read->surfaceM2,
            bedrooms: $read->bedrooms,
            location: $read->neighborhood,
        );
        $run = $this->runId === null ? null : RadarCrawlRun::query()->find($this->runId);
        $snapshots->observe($listing->refresh(), $card, $run, now());
    }

    private function lastmodDate(): ?CarbonImmutable
    {
        try {
            return $this->lastmod === null ? null : CarbonImmutable::parse($this->lastmod)->utc();
        } catch (Throwable) {
            return null;
        }
    }
}
