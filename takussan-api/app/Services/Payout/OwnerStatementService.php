<?php

namespace App\Services\Payout;

use App\Models\Agency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\ServiceProviderBill;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-594 (ADR-0039 §3) — le relevé de gérance d'un bailleur, dans une agence, pour un mois
 * (`YYYY-MM`) ou une année (`YYYY`, l'attestation annuelle).
 *
 * Il se lit sur les MÊMES règles que la préparation ({@see PayoutCalculator}) : encaissements
 * éligibles de la période (`paid_at`), commission ligne par ligne ; les frais sont les factures
 * d'intervention imputées aux reversements qui portent ces encaissements ; le net reversé se lit sur
 * ces reversements, avec leurs références. Il ne lit que `payee_role = landlord` : la caution rendue
 * au locataire n'est pas un reversement au bailleur.
 */
final class OwnerStatementService
{
    public function __construct(private readonly PayoutCalculator $calculator) {}

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable, 2: bool} début, fin, annuel */
    public static function period(string $period): array
    {
        if (preg_match('/^\d{4}$/', $period) === 1) {
            $start = CarbonImmutable::create((int) $period, 1, 1)->startOfDay();

            return [$start, $start->endOfYear(), true];
        }

        $start = CarbonImmutable::createFromFormat('!Y-m', $period)->startOfMonth();

        return [$start, $start->endOfMonth(), false];
    }

    /** @return array<string, mixed> */
    public function statement(Agency $agency, User $landlord, string $period): array
    {
        [$start, $end, $annual] = self::period($period);

        $leasePayments = $this->calculator->leasePayments((int) $agency->id, (int) $landlord->id, $start, $end, false)->get();
        $bookingPayments = $this->calculator->bookingPayments((int) $agency->id, (int) $landlord->id, $start, $end, false)->get();

        $payouts = $this->payoutsCarrying($agency, $landlord, $leasePayments->pluck('id')->all(), $bookingPayments->pluck('id')->all());
        $bills = ServiceProviderBill::query()
            ->whereIn('imputed_payout_id', $payouts->pluck('id'))
            ->orderBy('id')
            ->get();

        $computation = $this->calculator->compute($agency, $leasePayments, $bookingPayments, $bills);

        return [
            'agency' => ['id' => $agency->id, 'name' => $agency->name],
            'landlord' => ['id' => $landlord->id, 'name' => trim(($landlord->first_name ?? '').' '.($landlord->last_name ?? '')) ?: $landlord->username],
            'period' => $period,
            'annual' => $annual,
            'period_start' => $start->toDateString(),
            'period_end' => $end->toDateString(),
            'currency' => $computation['currency'],
            'totals' => array_merge($computation['totals'], [
                'paid_out' => (float) $payouts->where('status', PayoutStatus::Completed)->sum(fn (Payout $p) => (float) $p->net_amount),
            ]),
            'properties' => $this->byProperty($computation['lines']),
            'lines' => $computation['lines'],
            'payouts' => $payouts->map(fn (Payout $p): array => [
                'id' => $p->id,
                'reference_number' => $p->reference_number,
                'status' => $p->status?->value,
                'net_amount' => (float) $p->net_amount,
                'transaction_id' => $p->transaction_id,
                'processed_at' => $p->processed_at?->toIso8601String(),
            ])->values()->all(),
            'unpaid' => $this->unpaid($agency, $landlord, $start, $end),
        ];
    }

    /**
     * Les reversements AU BAILLEUR (jamais annulés ni échoués : ceux-là ont rendu leurs pièces) qui
     * portent au moins un encaissement de la période.
     *
     * @param  list<int>  $leaseIds
     * @param  list<int>  $bookingIds
     * @return Collection<int, Payout>
     */
    private function payoutsCarrying(Agency $agency, User $landlord, array $leaseIds, array $bookingIds)
    {
        return Payout::query()
            ->where('agency_id', $agency->id)
            ->where('landlord_id', $landlord->id)
            ->where('payee_role', PayeeRole::Landlord->value)
            ->whereIn('status', array_map(fn (PayoutStatus $s) => $s->value, PayoutStatus::holdingItems()))
            ->where(function ($q) use ($leaseIds, $bookingIds): void {
                $q->whereIn('id', DB::table('payout_lease_payment')->whereIn('lease_payment_id', $leaseIds ?: [0])->select('payout_id'))
                    ->orWhereIn('id', DB::table('payout_booking_payment')->whereIn('booking_payment_id', $bookingIds ?: [0])->select('payout_id'));
            })
            ->orderBy('id')
            ->get();
    }

    /**
     * @param  array<string, list<array<string, mixed>>>  $lines
     * @return list<array<string, mixed>>
     */
    private function byProperty(array $lines): array
    {
        $rows = [];
        foreach (['lease_payments', 'booking_payments'] as $set) {
            foreach ($lines[$set] as $line) {
                $id = $line['property_id'];
                $rows[$id] ??= ['property_id' => $id, 'collected' => 0.0, 'commission' => 0.0, 'fees' => 0.0];
                $rows[$id]['collected'] += $line['amount'];
                $rows[$id]['commission'] += $line['commission'];
            }
        }
        foreach ($lines['service_provider_bills'] as $line) {
            $id = $line['property_id'];
            $rows[$id] ??= ['property_id' => $id, 'collected' => 0.0, 'commission' => 0.0, 'fees' => 0.0];
            $rows[$id]['fees'] += $line['amount'];
        }

        return array_values(array_map(fn (array $r): array => $r + [
            'net' => $r['collected'] - $r['commission'] - $r['fees'],
        ], $rows));
    }

    /** @return array{count: int, amount: float} les loyers échus dans la période et non encaissés */
    private function unpaid(Agency $agency, User $landlord, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $query = LeasePayment::query()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->where('leases.agency_id', $agency->id)
            ->where('leases.landlord_id', $landlord->id)
            ->whereIn('lease_payments.payment_type', array_map(fn (LeasePaymentType $t) => $t->value, PayoutCalculator::LEASE_TYPES))
            ->whereIn('lease_payments.status', [PaymentStatus::Pending->value, PaymentStatus::Late->value, PaymentStatus::PartiallyPaid->value])
            ->whereBetween('lease_payments.due_date', [$start->toDateString(), $end->toDateString()]);

        return [
            'count' => (clone $query)->count(),
            'amount' => (float) $query->sum('lease_payments.amount'),
        ];
    }
}
