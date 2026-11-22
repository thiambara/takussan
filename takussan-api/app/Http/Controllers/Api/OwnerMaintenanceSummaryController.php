<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\OwnerMaintenanceSummaryRequest;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\ServiceProviderBill;
use App\Services\Dashboard\PortfolioScope;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2911 (ADR-0120 § 4) — `GET /api/owner/maintenance-summary?since=YYYY-MM-DD` : « Depuis janvier »
 * du bailleur du PROFIL ACTIF (403 sinon).
 *
 * - Périmètre : ses biens au sens de `BailleurDuBien`, bornés à l'agence du profil actif
 *   (`PortfolioScope::landlord()->dansLAgence()`).
 * - `total` : les interventions signalées depuis `since` (défaut : le 1er janvier de l'année en cours),
 *   hors annulées ; `closed` : celles d'entre elles closes.
 * - `charged_amount` : les factures de ces interventions refacturables et validées ou payées
 *   ({@see ServiceProviderBill::scopeChargedToLandlord()}, la règle du relevé du bailleur).
 * - `by_property` : un élément par bien qui a au moins une intervention ; leurs `total` somment le total.
 */
class OwnerMaintenanceSummaryController extends Controller
{
    public function __invoke(OwnerMaintenanceSummaryRequest $request): JsonResponse
    {
        $user = $request->user();
        $agencyId = (int) $user->agency_id;
        $since = $request->since();

        $propertyIds = PortfolioScope::landlord((int) $user->id)->dansLAgence($agencyId)
            ->properties(Property::query()->select('properties.id'));

        $requests = MaintenanceRequest::query()
            ->whereIn('property_id', $propertyIds)
            ->where('created_at', '>=', $since)
            ->where('status', '!=', MaintenanceStatus::Cancelled->value);

        $counts = (clone $requests)->toBase()
            ->select('property_id')
            ->selectRaw('COUNT(*) AS total')
            ->selectRaw('COUNT(*) FILTER (WHERE status = ?) AS closed', [MaintenanceStatus::Closed->value])
            ->groupBy('property_id')
            ->get()
            ->keyBy('property_id');

        $charged = ServiceProviderBill::query()
            ->chargedToLandlord()
            ->where('agency_id', $agencyId)
            ->whereIn('maintenance_request_id', (clone $requests)->select('id'))
            ->toBase()
            ->select('property_id')
            ->selectRaw('SUM(amount) AS charged')
            ->groupBy('property_id')
            ->pluck('charged', 'property_id');

        $titles = Property::query()->whereIn('id', $counts->keys()->all())->pluck('title', 'id');

        $byProperty = $counts->map(fn (object $row): array => [
            'property' => ['id' => (int) $row->property_id, 'title' => $titles[$row->property_id] ?? null],
            'total' => (int) $row->total,
            'closed' => (int) $row->closed,
            'charged_amount' => round((float) ($charged[$row->property_id] ?? 0), 2),
        ])
            ->sortBy([['charged_amount', 'desc'], ['total', 'desc'], [fn (array $a, array $b) => $a['property']['id'] <=> $b['property']['id']]])
            ->values()
            ->all();

        return $this->json(['data' => [
            'since' => $since->toDateString(),
            'total' => array_sum(array_column($byProperty, 'total')),
            'closed' => array_sum(array_column($byProperty, 'closed')),
            'charged_amount' => round(array_sum(array_column($byProperty, 'charged_amount')), 2),
            'currency' => 'XOF',
            'by_property' => $byProperty,
        ]]);
    }
}
