<?php

namespace App\Http\Controllers\Api\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Services\Credits\WalletSpace;
use Illuminate\Http\Request;

/**
 * TCK-2663 — l'espace actif dont on lit le portefeuille, autorisé, partagé par `CreditController`
 * (TCK-633 lot F) et `CreditBoostController` : 422 nommé quand il n'y en a pas, 403 sans
 * `boost.spend` sur cet espace (`CreditLotPolicy::viewAny`).
 */
trait ReadsWallet
{
    private function walletAgency(Request $request): Agency
    {
        $agencyId = WalletSpace::idFor($request);
        abort_code_if($agencyId === null, 422, 'credits.no_space');
        $agency = Agency::query()->findOrFail($agencyId);
        $this->authorize('viewAny', [CreditLot::class, $agency]);

        return $agency;
    }
}
