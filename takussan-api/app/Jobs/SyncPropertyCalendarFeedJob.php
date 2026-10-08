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
 * TCK-596 (VERIF-596 m3, ADR-0041 §5) — la PREMIÈRE synchronisation d'un flux qu'on vient
 * d'enregistrer. Elle se faisait dans la requête `POST properties/{p}/calendar-feeds` : un appel
 * sortant de 10 s au plus, tenu par un worker HTTP, à chaque création. Le flux est rendu en
 * `pending`, et c'est cette tâche qui va le chercher.
 *
 * Un flux supprimé entre-temps n'est pas une erreur : il n'y a plus rien à synchroniser.
 */
class SyncPropertyCalendarFeedJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tries = 1;

    public $timeout = 60;

    public function __construct(public readonly int $feedId) {}

    public function handle(PropertyCalendarSyncService $sync): void
    {
        $feed = PropertyCalendarFeed::query()->whereKey($this->feedId)->whereHas('property')->first();
        if ($feed !== null) {
            $sync->sync($feed);
        }
    }
}
