<?php

namespace App\Http\Requests\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Services\Credits\WalletSpace;

/**
 * TCK-2663 — lire le portefeuille de l'espace actif : la règle de `GET /api/credits`
 * (`CreditLotPolicy::viewAny`, `boost.spend` sur l'espace), jugée AVANT la validation (403 avant
 * 422). Hors d'un espace, le contrôleur rend 422 `credits.no_space`, comme `GET /api/credits`.
 */
trait AuthorizesWalletReading
{
    public function authorize(): bool
    {
        $user = $this->user();
        if ($user === null) {
            return false;
        }

        $agencyId = WalletSpace::idFor($this);
        if ($agencyId === null) {
            return true;
        }

        $agency = Agency::query()->find($agencyId);

        return $agency !== null && $user->can('viewAny', [CreditLot::class, $agency]);
    }
}
