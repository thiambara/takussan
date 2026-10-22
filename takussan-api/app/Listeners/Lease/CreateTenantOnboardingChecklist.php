<?php

namespace App\Listeners\Lease;

use App\Events\Lease\LeaseActivated;
use App\Listeners\Concerns\AlertsOnFirstListenerFailure;
use App\Services\Tenant\TenantOnboardingService;
use Illuminate\Contracts\Queue\ShouldQueue;

/**
 * TCK-266 — Sur `LeaseActivated`, crée la `TenantOnboardingChecklist`
 * associée si l'agence n'a pas désactivé le workflow EDL. La création
 * passe par {@see TenantOnboardingService::create} qui gère
 * l'idempotence (firstOrCreate sur lease_id) et le flag agency.
 *
 * Écouteur INDÉPENDANT de {@see SendTenantWelcomeNotification}, qui écoute le
 * même événement : le message d'accueil peut être coupé par une préférence de
 * notification, la checklist doit être créée dans tous les cas. Deux écouteurs
 * distincts sur `LeaseActivated` ne sont donc pas un doublon (TCK-443).
 *
 * TCK-1392 (P142.04) — seul chemin qui crée la checklist d'entrée : un délai entre deux
 * essais, et une alerte dès le premier échec final ({@see AlertsOnFirstListenerFailure}).
 */
class CreateTenantOnboardingChecklist implements ShouldQueue
{
    use AlertsOnFirstListenerFailure;

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
