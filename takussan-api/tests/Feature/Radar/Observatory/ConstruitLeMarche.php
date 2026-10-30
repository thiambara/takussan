<?php

namespace Tests\Feature\Radar\Observatory;

use App\Models\Enums\RadarCrawlStatus;
use App\Models\Enums\RadarCrawlTrigger;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use App\Models\RadarCrawlRun;
use App\Models\RadarListing;
use App\Models\RadarListingSnapshot;
use Carbon\CarbonInterface;

/**
 * TCK-2393 — de quoi semer un marché : des passages de collecte, des annonces collectées et leurs instantanés, écrits
 * directement (l'écrivain des instantanés est TCK-2392). Aucune donnée réelle : numéros en `+221 74 …`.
 */
trait ConstruitLeMarche
{
    /** @param  array<string, mixed>  $surcharge */
    protected function passage(string $debut, bool $finDeListe = true, array $surcharge = [], RadarSourceSite $site = RadarSourceSite::ExpatDakar): RadarCrawlRun
    {
        return RadarCrawlRun::query()->create($surcharge + [
            'site' => $site,
            'trigger' => RadarCrawlTrigger::Schedule,
            'status' => RadarCrawlStatus::Finished,
            'started_at' => $debut,
            'finished_at' => now()->parse($debut)->addMinutes(20),
            'reached_end' => $finDeListe,
            'stop_reason' => $finDeListe ? RadarCrawlRun::STOP_END : RadarCrawlRun::STOP_MAX_PAGES,
        ]);
    }

    /** @param  array<string, mixed>  $surcharge */
    protected function annonceCollectee(array $surcharge = [], RadarSourceSite $site = RadarSourceSite::ExpatDakar): RadarListing
    {
        return RadarListing::factory()->create($surcharge + [
            'source_kind' => RadarSourceKind::Url,
            'source_site' => $site,
            'source_url' => 'https://www.expat-dakar.com/annonce/'.fake()->unique()->numberBetween(1000, 999999),
            'stage' => RadarListingStage::Extracted,
        ]);
    }

    /** @param  array<string, mixed>  $surcharge */
    protected function instantane(RadarListing $annonce, string $de, string $a, array $surcharge = []): RadarListingSnapshot
    {
        return RadarListingSnapshot::query()->create($surcharge + [
            'radar_listing_id' => $annonce->id,
            'price' => 500000,
            'contract' => 'rent',
            'rent_period' => 'monthly',
            'property_type' => 'apartment',
            'surface_m2' => 100,
            'first_seen_at' => $de,
            'last_seen_at' => $a,
            'observations' => 1,
        ]);
    }

    protected function instant(string $quand): CarbonInterface
    {
        return now()->parse($quand);
    }
}
