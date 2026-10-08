<?php

namespace App\Jobs;

use App\Models\PropertyCalendarFeed;
use App\Services\Booking\PropertyCalendarSyncService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-596 §3B (ADR-0041 §5) — la synchronisation horaire des flux iCal importés.
 *
 * Un flux en échec est compté par le service, jamais levé : une plateforme tierce en panne ne doit
 * pas empêcher les autres flux de passer.
 */
class SyncPropertyCalendarFeedsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tries = 1;

    public $timeout = 540;

    public function handle(PropertyCalendarSyncService $sync): void
    {
        PropertyCalendarFeed::query()
            ->whereHas('property')
            ->chunkById(50, function ($feeds) use ($sync): void {
                foreach ($feeds as $feed) {
                    $sync->sync($feed);
                }
            });
    }
}
