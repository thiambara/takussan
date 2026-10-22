<?php

namespace App\Jobs\Billing;

use App\Services\Billing\AgencySubscriptionService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/** TCK-1303 (P115.03) — tâche quotidienne : reconduit la période échue des abonnements `active`. */
class RenewAgencySubscriptionPeriods implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(AgencySubscriptionService $subscriptions): void
    {
        $subscriptions->renewPeriods();
    }
}
