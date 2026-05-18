<?php

namespace App\Listeners\Lease;

use App\Events\Lease\LeaseActivated;
use App\Services\Tenant\TenantOnboardingService;
use Illuminate\Contracts\Queue\ShouldQueue;

/**
 * TCK-266 — Sur `LeaseActivated`, crée la `TenantOnboardingChecklist`
 * associée si l'agence n'a pas désactivé le workflow EDL. La création
 * passe par {@see TenantOnboardingService::create} qui gère
 * l'idempotence (firstOrCreate sur lease_id) et le flag agency.
 */
class CreateTenantOnboardingChecklist implements ShouldQueue
{
    public function __construct(private readonly TenantOnboardingService $service) {}

    public function handle(LeaseActivated $event): void
    {
        $lease = $event->lease->fresh();
        if ($lease === null) {
            return;
        }

        $this->service->create($lease);
    }
}
