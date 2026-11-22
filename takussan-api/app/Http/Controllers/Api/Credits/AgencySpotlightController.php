<?php

namespace App\Http\Controllers\Api\Credits;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Credits\AgencySpotlightQuoteRequest;
use App\Http\Requests\Credits\StoreAgencySpotlightPurchaseRequest;
use App\Models\AgencySpotlight;
use App\Services\Boost\SpotlightPurchaseService;
use App\Services\Boost\SpotlightSettings;
use App\Services\Credits\CreditLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2525 (amendement du 2026-11-16 d'ADR-0061) — la mise en avant de l'agence dans l'annuaire,
 * achetée par l'agence avec ses crédits : les réglages et ses places, le devis, l'achat. L'espace est
 * l'espace actif ; l'autorisation est celle du portefeuille (`boost.spend`, {@see ReadsWallet}).
 */
class AgencySpotlightController extends Controller
{
    use ReadsWallet;

    public function index(Request $request, SpotlightSettings $settings, CreditLedger $ledger): JsonResponse
    {
        $agency = $this->walletAgency($request);

        $places = AgencySpotlight::query()
            ->with('city:id,name')
            ->where('agency_id', $agency->getKey())
            ->whereNull('cancelled_at')
            ->where('ends_at', '>', now())
            ->orderBy('starts_at')
            ->limit(20)
            ->get();

        return $this->json([
            'data' => [
                'settings' => $settings->toArray(),
                'balance' => $ledger->balance($agency),
                'spotlights' => $places->map(fn (AgencySpotlight $p) => $this->forme($p))->values()->all(),
            ],
        ]);
    }

    public function quote(AgencySpotlightQuoteRequest $request, SpotlightPurchaseService $purchases, SpotlightSettings $settings, CreditLedger $ledger): JsonResponse
    {
        $agency = $this->walletAgency($request);
        $devis = $purchases->quote($request->geoCityId(), $request->requestedStart());
        $prix = $settings->priceCredits();
        $solde = $ledger->balance($agency);

        return $this->json(['data' => [
            'available' => $devis['available'],
            'reason' => $devis['reason'],
            'starts_at' => $this->instant($devis['starts_at']),
            'ends_at' => $this->instant($devis['ends_at']),
            'next_free_at' => $this->instant($devis['next_free_at']),
            'price_credits' => $prix,
            'balance' => $solde,
            'balance_after' => $solde - $prix,
        ]]);
    }

    public function store(StoreAgencySpotlightPurchaseRequest $request, SpotlightPurchaseService $purchases, CreditLedger $ledger): JsonResponse
    {
        $agency = $this->walletAgency($request);
        $achat = $purchases->purchase($agency, $request->geoCityId(), $request->requestedStart(), $request->user(), $request->idempotencyKey());

        return $this->json([
            'data' => $this->forme($achat->spotlight->fresh()->load('city:id,name')),
            'balance' => $ledger->balance($agency),
        ], $achat->replayed ? 200 : 201);
    }

    /** @return array<string, mixed> */
    private function forme(AgencySpotlight $place): array
    {
        return [
            'id' => $place->id,
            'geo_city_id' => $place->geo_city_id,
            'city' => $place->city === null ? null : ['id' => $place->city->id, 'name' => $place->city->name],
            'origin' => $place->origin,
            'price_credits' => $place->price_credits,
            'starts_at' => $this->instant($place->starts_at),
            'ends_at' => $this->instant($place->ends_at),
        ];
    }
}
