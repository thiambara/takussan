<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Services\Payments\PaymentGatewayService;
use App\Services\Payments\RentMonthStatus;
use App\Services\Property\PropertyListScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2637 — `GET /api/properties/portfolio-summary` : les comptes des tuiles et des pastilles de
 * la liste des biens en UN appel, au lieu d'une liste `per_page=1` par compte.
 *
 * Même autorisation et même portée que `GET /api/properties` (`PropertyListScope`, puis les
 * filtres de la requête par `Property::buildQuery()` : `filter[user_id]` pour « mes biens »,
 * `include_archived`, etc.). Chaque compte lit le scope que lit le filtre correspondant de la
 * liste, si bien qu'il égale son `meta.total` (AC3) :
 *
 * | clé | filtre de la liste |
 * |---|---|
 * | `total` | — |
 * | `occupied` (préavis compris), `vacant`, `notice` | `filter[occupancy]` |
 * | `rent_late` | `filter[rent_late]=1` |
 * | `online` | `filter[public]=1` |
 *
 * `vacant_over_60_days` (vacants dont le dernier bail a pris fin il y a 60 jours ou plus ; un bien
 * jamais loué n'y entre pas) et `rent_late_amount` (la somme des `current_month.amount_due` des
 * biens en retard, le calcul de l'historique des paiements) n'ont pas de liste correspondante.
 */
class PropertyPortfolioController extends Controller
{
    public const LONG_VACANCY_DAYS = 60;

    public function __construct(private readonly PaymentGatewayService $gateway) {}

    public function summary(Request $request): JsonResponse
    {
        $user = $request->user();
        $scope = Property::buildQuery(PropertyListScope::of($request), $request)->getEloquentBuilder();
        $count = fn (?callable $narrow = null): int => ($narrow === null ? (clone $scope) : $narrow(clone $scope))->reorder()->count();

        $latePayments = RentMonthStatus::lateOfMonth(LeasePayment::query())
            ->whereIn('lease_id', Lease::query()->current()->visibleTo($user)
                ->whereIn('property_id', (clone $scope)->reorder()->select('properties.id'))
                ->select('leases.id'))
            ->with('lease.agency')
            ->get();

        return $this->json(['data' => [
            'total' => $count(),
            'occupied' => $count(fn (Builder $q) => $q->occupancyState('occupied')),
            'vacant' => $count(fn (Builder $q) => $q->occupancyState('vacant')),
            'vacant_over_60_days' => $count(fn (Builder $q) => $q->vacantForAtLeast(self::LONG_VACANCY_DAYS)),
            'notice' => $count(fn (Builder $q) => $q->occupancyState('notice')),
            'rent_late' => $count(fn (Builder $q) => $q->rentLate($user)),
            'rent_late_amount' => round((float) $latePayments->sum(fn (LeasePayment $p) => $this->gateway->amountDue($p) ?? 0), 2),
            'online' => $count(fn (Builder $q) => $q->public()),
        ]]);
    }
}
