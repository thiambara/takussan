<?php

namespace App\Services\Property;

use App\Http\Controllers\Api\PaymentController;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Payments\PaymentGatewayService;
use App\Services\Payments\RentMonthStatus;
use App\Services\Reporting\OverdueInstalment;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * TCK-2637 — le bloc `occupancy` d'une page de biens, en un nombre CONSTANT de requêtes (AC6) :
 *
 * - `state` : `occupied`, `notice` (préavis) ou `vacant`, sur le bail COURANT
 *   ({@see Occupation::current()}, la règle de l'occupation du tableau de bord) ; `not_rental` pour
 *   un bien qui n'est pas à louer (TCK-2638), lu par le prédicat de la liste
 *   ({@see Property::scopeForRent()}) et non par la colonne chargée, que `fields[properties]` peut
 *   omettre ;
 * - `vacant_since` : la fin du dernier bail d'un bien vacant ({@see Occupation::lastEnds()}),
 *   `null` s'il n'a jamais été loué, et pour un bien hors location ;
 * - `lease`, `tenant`, `rent`, `current_month` : seulement vers un appelant qui peut LIRE le bail
 *   (`Lease::scopeVisibleTo`, la clause de `GET /api/leases`) ; absents sinon. Vacant : `null`.
 *   Un bien hors location AVEC un bail courant garde ces blocs : le bail est un fait, et le retard
 *   de son loyer compte dans `filter[rent_late]` (TCK-2638, décision du porteur Q2a).
 *
 * `current_month` lit les échéances de loyer du mois ({@see RentMonthStatus::ofMonth()}) : l'état
 * est celui du relevé du bailleur ({@see RentMonthStatus::of()}), et `amount_due` /
 * `late_fee_outstanding` sont le calcul de {@see PaymentController::history()} —
 * `PaymentGatewayService::amountDue()` et `LeasePayment::lateFeeOutstanding()` —, sommés sur les
 * échéances qui restent dues.
 */
final class PropertyOccupancy
{
    public function __construct(private readonly PaymentGatewayService $gateway) {}

    /** @param  Collection<int, Property>  $properties */
    public function attach(Collection $properties, ?User $viewer): void
    {
        if ($properties->isEmpty()) {
            return;
        }

        $ids = $properties->map(fn (Property $p) => (int) $p->getKey())->all();
        $forRent = array_flip(Property::withTrashed()->whereKey($ids)->forRent()->pluck('id')->all());
        $leases = Lease::query()->current()->whereIn('property_id', $ids)->with(['tenant', 'agency'])->get()->keyBy('property_id');
        $visible = $viewer === null || $leases->isEmpty() ? [] : array_flip(
            Lease::query()->whereKey($leases->modelKeys())->visibleTo($viewer)->pluck('leases.id')->all(),
        );
        $readable = $leases->filter(fn (Lease $lease) => isset($visible[$lease->id]))->keyBy('id');
        $dues = $readable->isEmpty() ? collect() : RentMonthStatus::ofMonth(LeasePayment::query())
            ->whereIn('lease_id', $readable->modelKeys())
            ->orderBy('due_date')->orderBy('id')
            ->get()
            ->each(fn (LeasePayment $p) => $p->setRelation('lease', $readable->get($p->lease_id)))
            ->groupBy('lease_id');
        $lastEnds = Occupation::lastEnds(array_values(array_diff($ids, $leases->keys()->all())));
        $today = OverdueInstalment::today();

        foreach ($properties as $property) {
            $lease = $leases->get($property->getKey());
            $rental = isset($forRent[$property->getKey()]);
            $block = [
                'state' => match (true) {
                    ! $rental => 'not_rental',
                    $lease === null => 'vacant',
                    Occupation::isOnNotice($lease) => 'notice',
                    default => 'occupied',
                },
                'vacant_since' => $rental && $lease === null && isset($lastEnds[$property->getKey()])
                    ? CarbonImmutable::parse($lastEnds[$property->getKey()])
                    : null,
            ];
            if ($lease === null) {
                $block += ['lease' => null, 'tenant' => null, 'rent' => null, 'current_month' => null];
            } elseif (isset($visible[$lease->id])) {
                $block += $this->leaseBlocks($lease, $dues->get($lease->id, collect()), $today);
            }
            $property->setOccupancyBlock($block);
        }
    }

    /**
     * @param  Collection<int, LeasePayment>  $dues
     * @return array<string, mixed>
     */
    private function leaseBlocks(Lease $lease, Collection $dues, string $today): array
    {
        $tenant = $lease->tenant;
        $state = RentMonthStatus::of($dues, true, $today);
        $owed = RentMonthStatus::owed($dues);
        $shown = $owed->first() ?? $dues->first();

        return [
            'lease' => [
                'id' => $lease->id,
                'reference_number' => $lease->reference_number,
                'type' => $lease->type?->value,
                'status' => $lease->status?->value,
                'start_date' => $lease->start_date,
                'end_date' => $lease->end_date,
            ],
            // La projection de `CustomerResource` dans `GET /api/leases?include=tenant` : nom et
            // téléphone, servis à tout lecteur du bail.
            'tenant' => $tenant === null ? null : [
                'id' => $tenant->id,
                'first_name' => $tenant->first_name,
                'last_name' => $tenant->last_name,
                'phone' => $tenant->phone,
            ],
            'rent' => [
                'amount' => $lease->monthly_rent !== null ? (float) $lease->monthly_rent : null,
                'charges' => $lease->monthly_charges !== null ? (float) $lease->monthly_charges : null,
                'currency' => $lease->currency?->value,
                'payment_frequency' => $lease->payment_frequency?->value,
            ],
            'current_month' => [
                'status' => $state['month_status'],
                'due_date' => $shown?->due_date,
                'days_late' => $state['days_late'],
                'amount_due' => round((float) $owed->sum(fn (LeasePayment $p) => $this->gateway->amountDue($p) ?? 0), 2),
                'late_fee_outstanding' => round((float) $dues->sum(fn (LeasePayment $p) => $p->lateFeeOutstanding()), 2),
            ],
        ];
    }
}
