<?php

namespace App\Jobs;

use App\Models\Lease;
use App\Services\Model\LeaseService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class GenerateLeasePaymentSchedule implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public readonly Lease $lease) {}

    public function handle(LeaseService $leaseService): void
    {
        // VERIF-596 — « aucune échéance » se juge sous le verrou du bail, dans le service : un
        // contrôle ici, hors verrou, laissait une génération manuelle concurrente doubler l'échéancier.
        $leaseService->generateScheduleIfMissing($this->lease);
    }
}
