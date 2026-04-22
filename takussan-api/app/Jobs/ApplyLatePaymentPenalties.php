<?php

namespace App\Jobs;

use App\Services\Model\LeaseLateFeeService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ApplyLatePaymentPenalties implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(LeaseLateFeeService $service): void
    {
        $service->applyAll();
    }
}
