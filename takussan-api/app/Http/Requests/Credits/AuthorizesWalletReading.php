<?php

namespace App\Http\Requests\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Services\Credits\WalletSpace;

/**
 * TCK-2663 — lire le portefeuille de l'espace actif : la règle de `GET /api/credits`
 * (`CreditLotPolicy::viewAny`, `boost.spend` sur l'espace), jugée AVANT la validation (403 avant
 * 422). Hors d'un espace, le contrôleur rend 422 `credits.no_space`, comme `GET /api/credits`.
 *
 * TCK-2728 — **une double garde, voulue.** La même règle est invoquée une seconde fois par
 * `App\Http\Controllers\Api\Credits\ReadsWallet::walletAgency()` :
 *
 * - sur `GET /api/credits/boosts` et `GET /api/credits/suggestions` (les deux FormRequest qui portent
 *   ce trait), les deux gardes jouent. Celle-ci seule fait passer 403 AVANT 422 : la retirer (ou la
 *   forcer à `true`) laisse le 403 d'un appel bien formé à `ReadsWallet`, mais un appel mal formé
 *   rend 422 — `CreditsBoostsListTest` et `CreditsSuggestionsTest` (« 403 avant la validation »)
 *   rougissent, et eux seuls (ablation du 2026-11-11) ;
 * - sur `GET /api/credits` et `GET /api/credits/balance`, qui n'ont pas de FormRequest, ce trait
 *   n'est PAS là : `ReadsWallet` y est la seule garde.
 *
 * Une ablation de l'une qui laisse les tests verts ne prouve pas qu'elle est inutile : l'autre la
 * couvre. N'en retirer aucune.
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
