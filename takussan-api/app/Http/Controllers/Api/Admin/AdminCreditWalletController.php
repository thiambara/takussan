<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\AdjustCreditWalletRequest;
use App\Http\Resources\Credits\CreditLotResource;
use App\Http\Resources\Credits\CreditMovementResource;
use App\Http\Resources\Credits\CreditWalletResource;
use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\CreditMovement;
use App\Services\Boost\BoostSettings;
use App\Services\Credits\CreditLedger;
use App\Services\Credits\InsufficientCredits;
use App\Support\CaseInsensitive;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** TCK-633 lot F (ADR-0061 §1, §2) — les portefeuilles des espaces, et leurs ajustements motivés. */
class AdminCreditWalletController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->input('search', ''));
        $paginator = Agency::query()
            ->whereIn('id', CreditLot::query()->select('agency_id'))
            ->when($search !== '', fn ($q) => $q->whereRaw(CaseInsensitive::sql('name').' LIKE ?', ['%'.CaseInsensitive::fold($search).'%']))
            ->orderBy('name')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 25))));

        $agencies = collect($paginator->items());
        $soldes = CreditLot::query()
            ->whereIn('agency_id', $agencies->pluck('id'))
            ->spendable()
            ->groupBy('agency_id')
            ->select('agency_id', DB::raw('SUM(remaining_amount) AS balance'), DB::raw('MIN(expires_at) AS next_expiry_at'))
            ->get()
            ->keyBy('agency_id');
        $agencies->each(fn (Agency $agency) => $agency->setAttribute('credit_balance', (int) ($soldes[$agency->id]->balance ?? 0))
            ->setAttribute('credit_next_expiry_at', $soldes[$agency->id]->next_expiry_at ?? null));

        return $this->paginated($paginator, CreditWalletResource::collection($agencies)->resolve());
    }

    public function show(Request $request, Agency $agency, CreditLedger $ledger): JsonResponse
    {
        $lots = CreditLot::query()->where('agency_id', $agency->getKey())->orderByDesc('created_at')->orderByDesc('id')->get();
        $movements = CreditMovement::query()
            ->where('agency_id', $agency->getKey())
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 25))));

        return $this->json([
            'data' => [
                'agency' => ['id' => $agency->id, 'name' => $agency->name, 'status' => $agency->status?->value],
                'balance' => $ledger->balance($agency),
                'lots' => CreditLotResource::collection($lots)->resolve(),
            ],
            'movements' => CreditMovementResource::collection($movements->items())->resolve(),
            'meta' => $this->paginationMeta($movements),
        ]);
    }

    public function adjust(AdjustCreditWalletRequest $request, Agency $agency, CreditLedger $ledger, BoostSettings $settings): JsonResponse
    {
        $amount = $request->integer('amount');
        $reason = (string) $request->validated('reason');

        try {
            // Un crédit manuel suit la validité de l'offre de bienvenue (écart E6).
            $lot = $ledger->adminAdjust($agency, $amount, $request->user(), $reason, $settings->welcomeValidityDays());
        } catch (InsufficientCredits $e) {
            abort_code(422, 'credits.insufficient', ['missing' => $e->missing(), 'balance' => $e->balance]);
        }

        activity('Credits')
            ->performedOn($agency)
            ->causedBy($request->user())
            ->withProperties(['agency_id' => $agency->id, 'amount' => $amount, 'reason' => $reason, 'lot_id' => $lot?->id])
            ->event('super_admin_credits_adjusted')
            ->log('Portefeuille de crédits ajusté');

        return $this->json(['data' => [
            'balance' => $ledger->balance($agency),
            'lot' => $lot ? CreditLotResource::make($lot)->resolve() : null,
        ]]);
    }
}
