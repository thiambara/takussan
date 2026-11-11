<?php

namespace App\Services\Billing;

use App\Models\Plan;

/**
 * TCK-2669 (ADR-0104 § 6) — le plan du passage en pro, désigné par `billing.upgrade_plan_code`.
 * Un seul endroit le résout : l'offre affichée avant la demande et l'abonnement posé à
 * l'approbation (TCK-2681) ne peuvent pas diverger. Un plan retiré (`is_active = false`) n'est
 * plus une offre.
 */
class UpgradeOffer
{
    public function plan(): ?Plan
    {
        return Plan::query()->active()
            ->where('code', (string) config('billing.upgrade_plan_code'))
            ->first();
    }
}
