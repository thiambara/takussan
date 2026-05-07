<?php

namespace App\Jobs\Billing;

use App\Services\Billing\AgencySubscriptionService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessTrialExpirations implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(AgencySubscriptionService $subscriptions): void
    {
        $subscriptions->processTrialExpirations();
    }
}
