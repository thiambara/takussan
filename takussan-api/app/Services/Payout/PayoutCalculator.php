<?php

namespace App\Services\Payout;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\Currency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\Enums\TaskStatus;
use App\Models\LeasePayment;
use App\Models\PlatformPayout;
use App\Models\ServiceProviderBill;
use App\Services\Billing\PlatformPayoutService;
use App\Services\Booking\BookingRefundTaskService;
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
 *    Une pièce remboursée en partie reste `paid` et compte pour `montant − refund_amount` (TCK-1214).
 *    `deposit` et `deposit_refund` sont exclus — la caution n'appartient pas au bailleur.
 *  - **Séjours** : `BookingPayment` `paid`, de type `deposit` (l'acompte du séjour) ou `advance`.
 *    `fee` est exclu — ce sont les frais de l'agence.
 *  - **Commission** : taux du bail, à défaut celui de l'agence, appliqué LIGNE PAR LIGNE et arrondi à
 *    l'unité de la devise (`Currency::decimalPlaces()`, 0 pour XOF). Le montant reste décimal : la
 *    conversion ×100 n'a lieu qu'à la frontière d'un pilote (principe n° 3).
 *  - **Frais** : factures d'intervention `validated`, refacturables, non encore imputées.
 *  - Une pièce déjà rattachée à un reversement n'est plus éligible : les pivots portent un index
 *    unique, et un reversement `cancelled` ou `failed` les détache.
 *  - Une pièce soldée par la plateforme n'est reversable qu'une fois son `PlatformPayout` `paid`
 *    (TCK-2064), hors agence `individual` : {@see self::exceptAwaitingPlatform()}.
 *  - **Pénalités de retard réglées** (P206.01, ADR-0039, amendement du 2026-10-24, point 6) : une
 *    ligne propre, au mois de `late_fee_paid_at`, au taux du bail ; éligibles tant que
 *    `late_fee_payout_id` est nul : {@see self::lateFees()}.
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

    /**
     * P206.01 (ADR-0039, amendement du 2026-10-24, point 6 ; TCK-594 : « pénalités […] reviennent
     * au bailleur, entrent dans le brut et portent commission ») — les lignes de loyer dont la
     * pénalité de retard a été réglée dans la période (`late_fee_paid_at`), quel que soit le statut
     * du loyer, sauf `cancelled`. L'éligibilité est propre à la pénalité (`late_fee_payout_id`) :
     * une pénalité réglée après le reversement de son loyer reste reversable.
     *
     * @return Builder<LeasePayment>
     */
    public function lateFees(int $agencyId, int $landlordId, ?CarbonInterface $from = null, ?CarbonInterface $to = null, bool $onlyUnpaidOut = true): Builder
    {
        $query = LeasePayment::query()
            ->select('lease_payments.*')
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->where('leases.agency_id', $agencyId)
            ->where('leases.landlord_id', $landlordId)
            ->where(fn (Builder $q) => $this->whereLateFeeSettled($q));

        $this->period($query, 'lease_payments.late_fee_paid_at', $from, $to);

        if ($onlyUnpaidOut) {
            $query->whereNull('lease_payments.late_fee_payout_id');
        }

        return $query->with('lease:id,reference_number,property_id,commission_rate,agency_id,landlord_id')
            ->orderBy('lease_payments.late_fee_paid_at')
            ->orderBy('lease_payments.id');
    }

    /**
     * La pénalité réglée d'une ligne, en SQL : le prédicat de {@see self::lateFees()}, relu par la
     * création sous verrou.
     *
     * @param  Builder<LeasePayment>  $query
     */
    public function whereLateFeeSettled(Builder $query): void
    {
        $query->where('lease_payments.status', '!=', PaymentStatus::Cancelled->value)
            ->whereIn('lease_payments.payment_type', array_map(fn ($t) => $t->value, self::LEASE_TYPES))
            ->whereNotNull('lease_payments.late_fee_paid_at')
            ->where('lease_payments.late_fee_amount', '>', 0);
    }

    /**
     * P206.01 (ADR-0039, amendement du 2026-10-24, point 6, « Encaisseur ») — une pénalité réglée
     * dans un checkout de la plateforme (la lecture de la clôture,
     * {@see PlatformPayoutService::lateFeeSettledByPlatform()}) attend que son `PlatformPayout` soit
     * `paid`, comme sa pièce (TCK-2064). Réglée à l'agence, elle est reversable aussitôt. Les agences
     * `individual` restent hors de la règle.
     *
     * @param  Collection<int, LeasePayment>  $lateFees
     * @return Collection<int, LeasePayment>
     */
    public function exceptLateFeesAwaitingPlatform(Collection $lateFees, Agency $agency): Collection
    {
        if ($agency->kind?->isIndividual() || $lateFees->isEmpty()) {
            return $lateFees;
        }

        $platform = app(PlatformPayoutService::class);
        $paid = PlatformPayout::query()
            ->whereIn('id', $lateFees->pluck('platform_payout_id')->filter()->unique()->values())
            ->where('status', PlatformPayoutStatus::Paid->value)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        return $lateFees->reject(fn (LeasePayment $fee): bool => ! in_array((int) $fee->platform_payout_id, $paid, true)
            && $platform->lateFeeSettledByPlatform($fee))->values();
    }

    /**
     * TCK-2154 (P200.02, décision du porteur du 2026-10-24) — sans les pièces retenues pour
     * remboursement ({@see self::whereHeldForRefund()}).
     *
     * @return Builder<BookingPayment>
     */
    public function bookingPayments(int $agencyId, int $landlordId, ?CarbonInterface $from = null, ?CarbonInterface $to = null, bool $onlyUnpaidOut = true): Builder
    {
        return $this->bookingPaymentsIncludingHeld($agencyId, $landlordId, $from, $to, $onlyUnpaidOut)
            ->whereNot(fn (Builder $q) => $this->whereHeldForRefund($q));
    }

    /**
     * TCK-2154 (P200.02) — les pièces de la période que la préparation retient, pour qu'elle les
     * signale (`held_for_refund`).
     *
     * @return Builder<BookingPayment>
     */
    public function bookingPaymentsHeldForRefund(int $agencyId, int $landlordId, ?CarbonInterface $from = null, ?CarbonInterface $to = null): Builder
    {
        return $this->bookingPaymentsIncludingHeld($agencyId, $landlordId, $from, $to)
            ->where(fn (Builder $q) => $this->whereHeldForRefund($q));
    }

    /**
     * TCK-2154 (P200.02) — parmi les acomptes cités, ceux qui sont retenus : la création d'un
     * reversement les refuse comme la préparation les écarte.
     *
     * @param  list<int>  $ids
     * @return list<int>
     */
    public function heldForRefundAmong(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        return BookingPayment::query()
            ->join('bookings', 'bookings.id', '=', 'booking_payments.booking_id')
            ->whereIn('booking_payments.id', $ids)
            ->where(fn (Builder $q) => $this->whereHeldForRefund($q))
            ->pluck('booking_payments.id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * TCK-2154 (P200.02, décision du porteur du 2026-10-24) — une pièce est retenue quand sa
     * réservation est close (`cancelled`, `rejected`, `expired`) et que la tâche `booking_refund`
     * de cette réservation est ouverte, tant qu'aucun geste « remboursé » ne l'a touchée : un
     * remboursement partiel la libère (le reste gardé, `montant − refund_amount`, redevient
     * reversable), un total la passe `refunded`, la clôture de la tâche libère toutes ses pièces.
     * Une pièce déjà reversée n'est pas retenue : le relevé la garde.
     *
     * Exige la jointure `bookings`.
     *
     * @param  Builder<BookingPayment>  $query
     */
    private function whereHeldForRefund(Builder $query): void
    {
        $query->whereIn('bookings.status', [
            BookingStatus::Cancelled->value,
            BookingStatus::Rejected->value,
            BookingStatus::Expired->value,
        ])
            ->where(fn (Builder $r) => $r->whereNull('booking_payments.refund_amount')->orWhere('booking_payments.refund_amount', 0))
            ->whereExists(fn ($task) => $task->selectRaw('1')->from('tasks')
                ->where('tasks.taskable_type', (new Booking)->getMorphClass())
                ->whereColumn('tasks.taskable_id', 'bookings.id')
                ->where('tasks.metadata->kind', BookingRefundTaskService::KIND)
                ->whereNotIn('tasks.status', [TaskStatus::Done->value, TaskStatus::Cancelled->value])
                ->whereNull('tasks.deleted_at'))
            ->whereNotExists(fn ($out) => $out->selectRaw('1')->from('payout_booking_payment')
                ->whereColumn('payout_booking_payment.booking_payment_id', 'booking_payments.id'));
    }

    /** @return Builder<BookingPayment> */
    private function bookingPaymentsIncludingHeld(int $agencyId, int $landlordId, ?CarbonInterface $from = null, ?CarbonInterface $to = null, bool $onlyUnpaidOut = true): Builder
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
     * TCK-2064 (P178.01, décision du porteur du 2026-10-23, option stricte) — retire des pièces
     * éligibles celles que la plateforme a encaissées (soldées par une intégration globale, la
     * lecture de `PlatformPayoutService::isSettledByPlatform()`) tant que leur `PlatformPayout`
     * n'est pas `paid` : l'agence n'a pas encore reçu cet argent, elle ne le reverse pas au bailleur.
     * Les agences `individual` restent hors de la règle (ADR-0039 § 2).
     *
     * Lu par la préparation et la création seules : le relevé de gérance et l'effacement de compte
     * comptent toujours ces pièces comme dues au bailleur.
     *
     * @template TModel of LeasePayment|BookingPayment
     *
     * @param  Builder<TModel>  $query
     * @return Builder<TModel>
     */
    public function exceptAwaitingPlatform(Builder $query, Agency $agency): Builder
    {
        if ($agency->kind?->isIndividual()) {
            return $query;
        }

        $table = $query->getModel()->getTable();

        return $query->where(fn (Builder $q) => $q->whereNotSettledByPlatform()
            ->orWhereExists(fn ($paid) => $paid->selectRaw('1')->from('platform_payouts')
                ->whereColumn('platform_payouts.id', "{$table}.platform_payout_id")
                ->where('platform_payouts.status', PlatformPayoutStatus::Paid->value)));
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
     * `$retainedRates` (P177.02, TCK-2017) : le taux qu'un reversement a déjà appliqué à une pièce,
     * par id. Il l'emporte sur le taux du jour : c'est le relevé de gérance qui le passe.
     *
     * @param  Collection<int, LeasePayment>  $leasePayments
     * @param  Collection<int, BookingPayment>  $bookingPayments
     * @param  Collection<int, ServiceProviderBill>  $bills
     * @param  array{lease_payments?: array<int, float>, booking_payments?: array<int, float>, late_fees?: array<int, float>}  $retainedRates
     * @param  Collection<int, LeasePayment>|null  $lateFees  les lignes de {@see self::lateFees()} (P206.01)
     * @return array{
     *     currency: string,
     *     lines: array{lease_payments: list<array<string,mixed>>, booking_payments: list<array<string,mixed>>, service_provider_bills: list<array<string,mixed>>, late_fees: list<array<string,mixed>>},
     *     totals: array{gross: float, commission: float, fees: float, net: float},
     * }
     */
    public function compute(Agency $agency, Collection $leasePayments, Collection $bookingPayments, Collection $bills, array $retainedRates = [], ?Collection $lateFees = null): array
    {
        $lateFees ??= collect();
        $currency = $this->currencyOf($agency, $leasePayments, $bookingPayments, $bills, $lateFees);
        $places = $currency->decimalPlaces();
        $agencyRate = $agency->commission_rate !== null ? (float) $agency->commission_rate : 0.0;

        $leaseLines = [];
        foreach ($leasePayments as $payment) {
            $rate = $retainedRates['lease_payments'][$payment->id]
                ?? ($payment->lease?->commission_rate !== null ? (float) $payment->lease->commission_rate : $agencyRate);
            $amount = $this->kept($payment);
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
            $amount = $this->kept($payment);
            $rate = $retainedRates['booking_payments'][$payment->id] ?? $agencyRate;
            $bookingLines[] = [
                'id' => $payment->id,
                'reference_number' => $payment->reference_number,
                'payment_type' => $payment->payment_type?->value,
                'booking_id' => $payment->booking_id,
                'booking_reference' => $payment->booking?->reference_number,
                'property_id' => $payment->booking?->property_id,
                'paid_at' => $payment->paid_at?->toIso8601String(),
                'amount' => $amount,
                'commission_rate' => $rate,
                'commission_rate_source' => 'agency',
                'commission' => $this->round($amount * $rate / 100, $places),
            ];
        }

        // P206.01 — la pénalité réglée : une ligne à part, datée de son règlement, au taux du bail.
        $lateFeeLines = [];
        foreach ($lateFees as $payment) {
            $rate = $retainedRates['late_fees'][$payment->id]
                ?? ($payment->lease?->commission_rate !== null ? (float) $payment->lease->commission_rate : $agencyRate);
            $amount = max(0.0, (float) $payment->late_fee_amount);
            $lateFeeLines[] = [
                'id' => $payment->id,
                'reference_number' => $payment->reference_number,
                'payment_type' => 'late_fee',
                'lease_id' => $payment->lease_id,
                'lease_reference' => $payment->lease?->reference_number,
                'property_id' => $payment->lease?->property_id,
                'paid_at' => $payment->late_fee_paid_at?->toIso8601String(),
                'amount' => $amount,
                'commission_rate' => $rate,
                'commission_rate_source' => $payment->lease?->commission_rate !== null ? 'lease' : 'agency',
                'commission' => $this->round($amount * $rate / 100, $places),
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

        $gross = $this->round(array_sum(array_column($leaseLines, 'amount')) + array_sum(array_column($bookingLines, 'amount')) + array_sum(array_column($lateFeeLines, 'amount')), $places);
        $commission = $this->round(array_sum(array_column($leaseLines, 'commission')) + array_sum(array_column($bookingLines, 'commission')) + array_sum(array_column($lateFeeLines, 'commission')), $places);
        $fees = $this->round(array_sum(array_column($billLines, 'amount')), $places);

        return [
            'currency' => $currency->value,
            'lines' => [
                'lease_payments' => $leaseLines,
                'booking_payments' => $bookingLines,
                'service_provider_bills' => $billLines,
                'late_fees' => $lateFeeLines,
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
     * TCK-1214 (P76.02, option (b) du porteur) — un remboursement partiel laisse la pièce `paid` :
     * le bailleur reçoit ce qui a été gardé, `montant − refund_amount`, et la commission se calcule
     * sur cette base.
     */
    private function kept(LeasePayment|BookingPayment $payment): float
    {
        return max(0.0, (float) $payment->amount - (float) ($payment->refund_amount ?? 0));
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
