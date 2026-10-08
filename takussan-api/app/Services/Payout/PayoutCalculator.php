<?php

namespace App\Services\Payout;

use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\LeasePayment;
use App\Models\ServiceProviderBill;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * TCK-594 (ADR-0039 §3) — LE calcul d'un reversement au bailleur. Préparation, création et relevé de
 * gérance l'empruntent ; aucun ne le réécrit.
 *
 * Le brut n'est jamais une saisie : il se lit sur les pièces encaissées. Les règles :
 *
 *  - **Loyers** : `LeasePayment` `paid`, de type `rent`, `charges`, `penalty` ou `regularization`.
 *    `deposit` et `deposit_refund` sont exclus — la caution n'appartient pas au bailleur.
 *  - **Séjours** : `BookingPayment` `paid`, de type `deposit` (l'acompte du séjour) ou `advance`.
 *    `fee` est exclu — ce sont les frais de l'agence.
 *  - **Commission** : taux du bail, à défaut celui de l'agence, appliqué LIGNE PAR LIGNE et arrondi à
 *    l'unité de la devise (`Currency::decimalPlaces()`, 0 pour XOF). Le montant reste décimal : la
 *    conversion ×100 n'a lieu qu'à la frontière d'un pilote (principe n° 3).
 *  - **Frais** : factures d'intervention `validated`, refacturables, non encore imputées.
 *  - Une pièce déjà rattachée à un reversement n'est plus éligible : les pivots portent un index
 *    unique, et un reversement `cancelled` ou `failed` les détache.
 */
final class PayoutCalculator
{
    /** @var list<LeasePaymentType> */
    public const LEASE_TYPES = [
        LeasePaymentType::Rent,
        LeasePaymentType::Charges,
        LeasePaymentType::Penalty,
        LeasePaymentType::Regularization,
    ];

    /** @var list<BookingPaymentType> */
    public const BOOKING_TYPES = [
        BookingPaymentType::Deposit,
        BookingPaymentType::Advance,
    ];

    /**
     * Les loyers encaissés d'un bailleur dans une agence. Sans période : toute pièce éligible.
     *
     * @return Builder<LeasePayment>
     */
    public function leasePayments(int $agencyId, int $landlordId, ?CarbonInterface $from = null, ?CarbonInterface $to = null, bool $onlyUnpaidOut = true): Builder
    {
        $query = LeasePayment::query()
            ->select('lease_payments.*')
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->where('leases.agency_id', $agencyId)
            ->where('leases.landlord_id', $landlordId)
            ->where('lease_payments.status', PaymentStatus::Paid->value)
            ->whereIn('lease_payments.payment_type', array_map(fn ($t) => $t->value, self::LEASE_TYPES))
            ->whereNotNull('lease_payments.paid_at')
            ->with('lease:id,reference_number,property_id,commission_rate,agency_id,landlord_id');

        $this->period($query, 'lease_payments.paid_at', $from, $to);

        if ($onlyUnpaidOut) {
            $query->whereNotExists(fn ($q) => $q->selectRaw('1')->from('payout_lease_payment')
                ->whereColumn('payout_lease_payment.lease_payment_id', 'lease_payments.id'));
        }

        return $query->orderBy('lease_payments.paid_at')->orderBy('lease_payments.id');
    }

    /** @return Builder<BookingPayment> */
    public function bookingPayments(int $agencyId, int $landlordId, ?CarbonInterface $from = null, ?CarbonInterface $to = null, bool $onlyUnpaidOut = true): Builder
    {
        $query = BookingPayment::query()
            ->select('booking_payments.*')
            ->join('bookings', 'bookings.id', '=', 'booking_payments.booking_id')
            ->join('properties', 'properties.id', '=', 'bookings.property_id')
            ->where('bookings.agency_id', $agencyId)
            ->where('properties.user_id', $landlordId)
            ->where('booking_payments.status', PaymentStatus::Paid->value)
            ->whereIn('booking_payments.payment_type', array_map(fn ($t) => $t->value, self::BOOKING_TYPES))
            ->whereNotNull('booking_payments.paid_at')
            ->with('booking:id,reference_number,property_id,agency_id');

        $this->period($query, 'booking_payments.paid_at', $from, $to);

        if ($onlyUnpaidOut) {
            $query->whereNotExists(fn ($q) => $q->selectRaw('1')->from('payout_booking_payment')
                ->whereColumn('payout_booking_payment.booking_payment_id', 'booking_payments.id'));
        }

        return $query->orderBy('booking_payments.paid_at')->orderBy('booking_payments.id');
    }

    /**
     * Les factures d'intervention refacturables au bailleur du bien, validées et non imputées.
     *
     * @return Builder<ServiceProviderBill>
     */
    public function rechargeableBills(int $agencyId, int $landlordId): Builder
    {
        return ServiceProviderBill::query()
            ->select('service_provider_bills.*')
            ->join('properties', 'properties.id', '=', 'service_provider_bills.property_id')
            ->where('service_provider_bills.agency_id', $agencyId)
            ->where('properties.user_id', $landlordId)
            ->where('service_provider_bills.rechargeable_to_landlord', true)
            ->whereIn('service_provider_bills.status', [
                ServiceProviderBillStatus::Validated->value,
                ServiceProviderBillStatus::Paid->value,
            ])
            ->whereNull('service_provider_bills.imputed_payout_id')
            ->orderBy('service_provider_bills.id');
    }

    /**
     * @param  Collection<int, LeasePayment>  $leasePayments
     * @param  Collection<int, BookingPayment>  $bookingPayments
     * @param  Collection<int, ServiceProviderBill>  $bills
     * @return array{
     *     currency: string,
     *     lines: array{lease_payments: list<array<string,mixed>>, booking_payments: list<array<string,mixed>>, service_provider_bills: list<array<string,mixed>>},
     *     totals: array{gross: float, commission: float, fees: float, net: float},
     * }
     */
    public function compute(Agency $agency, Collection $leasePayments, Collection $bookingPayments, Collection $bills): array
    {
        $currency = $this->currencyOf($agency, $leasePayments, $bookingPayments, $bills);
        $places = $currency->decimalPlaces();
        $agencyRate = $agency->commission_rate !== null ? (float) $agency->commission_rate : 0.0;

        $leaseLines = [];
        foreach ($leasePayments as $payment) {
            $rate = $payment->lease?->commission_rate !== null ? (float) $payment->lease->commission_rate : $agencyRate;
            $amount = (float) $payment->amount;
            $leaseLines[] = [
                'id' => $payment->id,
                'reference_number' => $payment->reference_number,
                'payment_type' => $payment->payment_type?->value,
                'lease_id' => $payment->lease_id,
                'lease_reference' => $payment->lease?->reference_number,
                'property_id' => $payment->lease?->property_id,
                'paid_at' => $payment->paid_at?->toIso8601String(),
                'amount' => $amount,
                'commission_rate' => $rate,
                'commission_rate_source' => $payment->lease?->commission_rate !== null ? 'lease' : 'agency',
                'commission' => $this->round($amount * $rate / 100, $places),
            ];
        }

        $bookingLines = [];
        foreach ($bookingPayments as $payment) {
            $amount = (float) $payment->amount;
            $bookingLines[] = [
                'id' => $payment->id,
                'reference_number' => $payment->reference_number,
                'payment_type' => $payment->payment_type?->value,
                'booking_id' => $payment->booking_id,
                'booking_reference' => $payment->booking?->reference_number,
                'property_id' => $payment->booking?->property_id,
                'paid_at' => $payment->paid_at?->toIso8601String(),
                'amount' => $amount,
                'commission_rate' => $agencyRate,
                'commission_rate_source' => 'agency',
                'commission' => $this->round($amount * $agencyRate / 100, $places),
            ];
        }

        $billLines = [];
        foreach ($bills as $bill) {
            $billLines[] = [
                'id' => $bill->id,
                'reference_number' => $bill->reference_number,
                'maintenance_request_id' => $bill->maintenance_request_id,
                'property_id' => $bill->property_id,
                'amount' => $this->round((float) $bill->amount, $places),
            ];
        }

        $gross = $this->round(array_sum(array_column($leaseLines, 'amount')) + array_sum(array_column($bookingLines, 'amount')), $places);
        $commission = $this->round(array_sum(array_column($leaseLines, 'commission')) + array_sum(array_column($bookingLines, 'commission')), $places);
        $fees = $this->round(array_sum(array_column($billLines, 'amount')), $places);

        return [
            'currency' => $currency->value,
            'lines' => [
                'lease_payments' => $leaseLines,
                'booking_payments' => $bookingLines,
                'service_provider_bills' => $billLines,
            ],
            'totals' => [
                'gross' => $gross,
                'commission' => $commission,
                'fees' => $fees,
                'net' => $this->round($gross - $commission - $fees, $places),
            ],
        ];
    }

    /**
     * Toutes les pièces sont dans la devise de l'agence : un reversement ne mélange pas deux
     * devises (V1 ne convertit pas, `Currency`).
     */
    private function currencyOf(Agency $agency, Collection ...$sets): Currency
    {
        $agencyCurrency = $agency->currency instanceof Currency ? $agency->currency : Currency::default();

        foreach ($sets as $set) {
            foreach ($set as $item) {
                $currency = $item->currency instanceof Currency ? $item->currency : Currency::tryFrom((string) $item->currency);
                if ($currency !== null && $currency !== $agencyCurrency) {
                    abort_code(422, 'payout.mixed_currencies');
                }
            }
        }

        return $agencyCurrency;
    }

    /**
     * La règle de `PaymentGatewayService::roundToCurrencyUnit()` (TCK-593, l'arrondi XOF de
     * référence) : à l'unité de la devise, au plus proche, la moitié vers le haut. Ce qui entre
     * et ce qui sort s'arrondissent de la même façon.
     */
    private function round(float $value, int $places): float
    {
        return round($value, $places, PHP_ROUND_HALF_UP);
    }

    private function period(Builder $query, string $column, ?CarbonInterface $from, ?CarbonInterface $to): void
    {
        if ($from !== null) {
            $query->where($column, '>=', $from->copy()->startOfDay());
        }
        if ($to !== null) {
            $query->where($column, '<=', $to->copy()->endOfDay());
        }
    }
}
