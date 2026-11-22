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
 *
 * TCK-2728 — **une double garde, voulue.** La même règle est aussi jugée, avant la validation, par
 * `App\Http\Requests\Credits\AuthorizesWalletReading::authorize()` :
 *
 * - sur `GET /api/credits` et `GET /api/credits/balance` (`CreditController`, sans FormRequest),
 *   l'`authorize` ci-dessous est la SEULE garde : le retirer fait rougir « l'agent n'y a pas accès »
 *   de `CreditsApiTest` et de `CreditBalanceEndpointTest` (ablation du 2026-11-11) ;
 * - sur `GET /api/credits/boosts` et `GET /api/credits/suggestions` (`CreditBoostController`), le
 *   FormRequest la juge déjà : le retirer ici laisse tout vert, l'autre garde couvrant celle-ci.
 *
 * Une ablation de l'une qui laisse les tests verts ne prouve pas qu'elle est inutile : l'autre la
 * couvre. N'en retirer aucune.
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
