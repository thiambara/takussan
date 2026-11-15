<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\ServiceProviderBill;
use App\Models\User;

/**
 * TCK-594 (ADR-0039 §8) — la facture d'intervention : le prestataire lit les siennes ; le
 * personnel de l'agence qui détient `payouts.create` les lit, les valide, les rejette, les paie.
 *
 * La LECTURE d'une facture d'autrui rend 404, pas 403 : `ServiceProviderBillController` résout la
 * facture dans le périmètre du lecteur avant toute policy. Les gestes se jugent ici.
 */
class ServiceProviderBillPolicy
{
    public function manage(User $user, ServiceProviderBill $bill): bool
    {
        if ($bill->agency_id === null || $user->staffAgencyId() !== (int) $bill->agency_id) {
            return false;
        }

        $agency = Agency::query()->find($bill->agency_id);

        return $agency !== null && $user->canActAt(Capability::PayoutsCreate, $agency);
    }

    /**
     * TCK-2911 (ADR-0120 § 1) — « Facturer » : le prestataire de la facture, et lui seul. Ni le
     * personnel (qui valide, il n'émet pas), ni un autre prestataire. Le statut se juge sous verrou.
     */
    public function submit(User $user, ServiceProviderBill $bill): bool
    {
        return $bill->provider_id !== null && (int) $bill->provider_id === (int) $user->id;
    }
}
