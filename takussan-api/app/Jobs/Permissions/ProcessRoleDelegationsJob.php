<?php

namespace App\Jobs\Permissions;

use App\Models\RoleDelegation;
use App\Services\Permissions\RoleDelegationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessRoleDelegationsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(RoleDelegationService $service): void
    {
        // Activate scheduled delegations that have reached their start time
        RoleDelegation::readyToActivate()->cursor()->each(function (RoleDelegation $delegation) use ($service) {
            $service->activate($delegation);
        });

        // Expire active delegations that have passed their end time
        RoleDelegation::readyToExpire()->cursor()->each(function (RoleDelegation $delegation) use ($service) {
            $service->expire($delegation);
        });
    }
}
