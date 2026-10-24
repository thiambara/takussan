<?php

namespace App\Services\Payout;

use App\Models\Agency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PayoutStatus;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\ServiceProviderBill;
use App\Models\User;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Dashboard\PortfolioMetrics;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-594 (ADR-0039 §3) — le relevé de gérance d'un bailleur, dans une agence, pour un mois
 * (`YYYY-MM`) ou une année (`YYYY`, l'attestation annuelle).
 *
 * Il se lit sur les MÊMES règles que la préparation ({@see PayoutCalculator}) : encaissements
 * éligibles de la période (`paid_at`), commission ligne par ligne ; les frais sont les factures
 * d'intervention imputées aux reversements versés dans la période (`processed_at`, P177.03), et le
 * versé se lit sur ces mêmes reversements. La liste cite aussi les reversements qui portent un
 * encaissement de la période, marqués `paid_in_period` quand ils ont été versés dans la période.
 * Il ne lit que `payee_role = landlord` : la caution rendue
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

        // P206.01 — la pénalité réglée dans la période, reversée ou non, comme les pièces.
        $lateFees = $this->calculator->lateFees((int) $agency->id, (int) $landlord->id, $start, $end, false)->get();

        $carrying = $this->payoutsCarrying($agency, $landlord, $leasePayments->pluck('id')->all(), $bookingPayments->pluck('id')->all(), $lateFees);
        // P177.03 (TCK-2041) — le versé et les frais vont au mois de `processed_at`, comme le « net
        // reversé » du tableau de bord ({@see PortfolioMetrics::netPaidOutByMonth()}) : un reversement
        // qui porte des pièces de plusieurs mois n'est compté, frais compris, que dans le mois où il
        // a été versé, et la somme des mois rejoint l'année. Brut et commission restent ventilés par
        // pièce de la période. Les frais d'un reversement pas encore versé n'entrent dans aucun mois.
        $paid = $this->payoutsPaidIn($agency, $landlord, $start, $end);
        $bills = ServiceProviderBill::query()
            ->whereIn('imputed_payout_id', $paid->pluck('id'))
            ->orderBy('id')
            ->get();

        $computation = $this->calculator->compute($agency, $leasePayments, $bookingPayments, $bills, $this->retainedRates($carrying, $lateFees), $lateFees);
        $paidIds = $paid->pluck('id')->all();
        $payouts = $carrying->concat($paid)->unique('id')->sortBy('id')->values();

        return [
            'agency' => ['id' => $agency->id, 'name' => $agency->name],
            'landlord' => ['id' => $landlord->id, 'name' => trim(($landlord->first_name ?? '').' '.($landlord->last_name ?? '')) ?: $landlord->username],
            'period' => $period,
            'annual' => $annual,
            'period_start' => $start->toDateString(),
            'period_end' => $end->toDateString(),
            'currency' => $computation['currency'],
            'totals' => array_merge($computation['totals'], [
                'paid_out' => (float) $paid->sum(fn (Payout $p) => (float) $p->net_amount),
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
                'paid_in_period' => in_array($p->id, $paidIds, true),
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
     * @param  Collection<int, LeasePayment>  $lateFees  P206.01 — une pénalité reversée porte son reversement
     * @return Collection<int, Payout>
     */
    private function payoutsCarrying(Agency $agency, User $landlord, array $leaseIds, array $bookingIds, Collection $lateFees)
    {
        $lateFeePayoutIds = $lateFees->pluck('late_fee_payout_id')->filter()->unique()->values()->all();

        return Payout::query()
            ->where('agency_id', $agency->id)
            ->where('landlord_id', $landlord->id)
            ->where('payee_role', PayeeRole::Landlord->value)
            ->whereIn('status', array_map(fn (PayoutStatus $s) => $s->value, PayoutStatus::holdingItems()))
            ->where(function ($q) use ($leaseIds, $bookingIds, $lateFeePayoutIds): void {
                $q->whereIn('id', DB::table('payout_lease_payment')->whereIn('lease_payment_id', $leaseIds ?: [0])->select('payout_id'))
                    ->orWhereIn('id', DB::table('payout_booking_payment')->whereIn('booking_payment_id', $bookingIds ?: [0])->select('payout_id'))
                    ->orWhereIn('id', $lateFeePayoutIds ?: [0]);
            })
            ->orderBy('id')
            ->get();
    }

    /**
     * P177.03 (TCK-2041) — les reversements AU BAILLEUR versés (`completed`) dans la période, par
     * `processed_at`, la règle de {@see PortfolioMetrics::netPaidOutByMonth()}.
     *
     * @return Collection<int, Payout>
     */
    private function payoutsPaidIn(Agency $agency, User $landlord, CarbonImmutable $start, CarbonImmutable $end)
    {
        return Payout::query()
            ->where('agency_id', $agency->id)
            ->where('landlord_id', $landlord->id)
            ->where('payee_role', PayeeRole::Landlord->value)
            ->where('status', PayoutStatus::Completed->value)
            ->whereBetween('processed_at', [$start->startOfDay(), $end->endOfDay()])
            ->orderBy('id')
            ->get();
    }

    /**
     * P177.02 (TCK-2017) — le taux que chaque reversement a appliqué à ses pièces, copié dans le pivot à
     * sa création : la commission d'un mois reversé ne se recalcule pas au taux d'agence du jour. Une
     * ligne de pivot sans copie (antérieure à la copie) n'y figure pas, et suit le taux du jour.
     *
     * P206.01 — la pénalité reversée garde de même le taux copié sur sa ligne
     * (`late_fee_payout_commission_rate`).
     *
     * @param  Collection<int, Payout>  $payouts
     * @param  Collection<int, LeasePayment>  $lateFees
     * @return array{lease_payments: array<int, float>, booking_payments: array<int, float>, late_fees: array<int, float>}
     */
    private function retainedRates(Collection $payouts, Collection $lateFees): array
    {
        $rates = [];
        foreach (['lease_payments' => ['payout_lease_payment', 'lease_payment_id'], 'booking_payments' => ['payout_booking_payment', 'booking_payment_id']] as $set => [$pivot, $column]) {
            $rates[$set] = DB::table($pivot)
                ->whereIn('payout_id', $payouts->pluck('id')->all() ?: [0])
                ->whereNotNull('commission_rate')
                ->pluck('commission_rate', $column)
                ->map(fn ($rate): float => (float) $rate)
                ->all();
        }

        $rates['late_fees'] = $lateFees
            ->filter(fn (LeasePayment $fee): bool => $fee->late_fee_payout_id !== null && $fee->late_fee_payout_commission_rate !== null)
            ->mapWithKeys(fn (LeasePayment $fee): array => [(int) $fee->id => (float) $fee->late_fee_payout_commission_rate])
            ->all();

        return $rates;
    }

    /**
     * @param  array<string, list<array<string, mixed>>>  $lines
     * @return list<array<string, mixed>>
     */
    private function byProperty(array $lines): array
    {
        $rows = [];
        foreach (['lease_payments', 'booking_payments', 'late_fees'] as $set) {
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

    /**
     * Les loyers échus dans la période et non encaissés. « Échu » = dû avant aujourd'hui, et un bail
     * supprimé ne compte pas : les deux règles de {@see PortfolioMetrics::overdue()}
     * (P93.02, TCK-1175). Les types restent ceux du relevé ({@see PayoutCalculator::LEASE_TYPES}).
     *
     * @return array{as_of: string, count: int, amount: float}
     */
    private function unpaid(Agency $agency, User $landlord, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $query = CollectedPayments::leaseOwed()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->whereNull('leases.deleted_at')
            ->where('leases.agency_id', $agency->id)
            ->where('leases.landlord_id', $landlord->id)
            ->whereIn('lease_payments.payment_type', array_map(fn (LeasePaymentType $t) => $t->value, PayoutCalculator::LEASE_TYPES))
            ->whereBetween('lease_payments.due_date', [$start->toDateString(), $end->toDateString()])
            ->whereDate('lease_payments.due_date', '<', now()->toDateString());

        return [
            // P177.06 (TCK-1785) — le jour où « échu » a été jugé : un mois passé voit ses impayés
            // baisser à mesure que les loyers se règlent, le relevé dit donc à quelle date il les lit.
            'as_of' => now()->toDateString(),
            'count' => (clone $query)->count(),
            // verif-595 passe 2 — le reste dû, la règle des tuiles Impayés et de la balance âgée.
            'amount' => round((float) $query->sum(DB::raw(CollectedPayments::OWED_REMAINING_SQL)), 2),
        ];
    }
}
