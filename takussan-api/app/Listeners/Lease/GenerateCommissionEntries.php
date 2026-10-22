<?php

namespace App\Listeners\Lease;

use App\Events\Lease\LeaseActivated;
use App\Listeners\Concerns\AlertsOnFirstListenerFailure;
use App\Services\Commission\CommissionLedgerService;
use Illuminate\Contracts\Queue\ShouldQueue;

/**
 * TCK-595 (ADR-0049 §3) — à l'activation d'un bail, fait naître ses lignes de commission.
 *
 * `LeaseActivated` est émis par toute activation (`LeaseService::completeActivation()`), y compris
 * celle d'un renouvellement né `pending_signature` (TCK-596) : c'est le service qui refuse les
 * renouvellements. L'écouteur relit le bail (`fresh()`) : la ventilation se juge sur l'état validé,
 * et l'idempotence du service rend une nouvelle tentative de la file sans effet.
 *
 * TCK-1392 (P142.04) — seul chemin qui écrit les lignes de commission : un délai entre deux
 * essais, et une alerte dès le premier échec final ({@see AlertsOnFirstListenerFailure}).
 */
class GenerateCommissionEntries implements ShouldQueue
{
    use AlertsOnFirstListenerFailure;

    public function __construct(private readonly CommissionLedgerService $ledger) {}

    public function handle(LeaseActivated $event): void
    {
        $lease = $event->lease->fresh();
        if ($lease === null) {
            return;
        }

        $this->ledger->generateFor($lease);
    }
}
