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
        if ($this->lease->payments()->count() > 0) {
            return;
        }

        $leaseService->generateSchedule($this->lease);
    }
}
