<?php

namespace App\Http\Controllers\Api\Credits;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Credits\IndexCreditLotsRequest;
use App\Http\Resources\Credits\CreditLotResource;
use App\Models\CreditLot;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2924 — l'historique des lots de l'espace ACTIF : ceux qu'on ne peut plus dépenser, épuisés
 * (`spent`) ou expirés (`expired`), le plus récent d'abord. `GET /api/credits` garde les lots vivants.
 * Même espace et même autorisation (`ReadsWallet`, ADR-0061).
 */
class CreditLotController extends Controller
{
    use ReadsWallet;

    public function index(IndexCreditLotsRequest $request): JsonResponse
    {
        $agency = $this->walletAgency($request);

        $lots = CreditLot::buildQuery(
            // `credit_lots.*` d'abord : `fields[credit_lots]` le remplace, et `state` s'y ajoute.
            CreditLot::query()->select('credit_lots.*')->where('credit_lots.agency_id', $agency->getKey())->notSpendable(),
            $request,
        )
            ->addSelect(DB::raw(CreditLot::stateSql().' AS state'))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($this->tailleDePage($request, 20, 50));

        return $this->paginated($lots, CreditLotResource::collection($lots->getCollection())->resolve($request));
    }
}
