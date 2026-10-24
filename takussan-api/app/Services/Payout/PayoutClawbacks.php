<?php

namespace App\Services\Payout;

use App\Models\BookingPayment;
use App\Models\Enums\Currency;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PayoutStatus;
use App\Models\LeasePayment;
use App\Models\Payout;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2151 (P205.01, P177.01, P205.03 ; ADR-0039, amendement du 2026-10-24, points 2 à 4) — la
 * reprise au bailleur.
 *
 * Un remboursement d'une pièce portée par un reversement au bailleur `completed` crée une reprise au
 * net de commission (`R − arrondi(R × taux / 100)`, au taux de la copie du pivot, TCK-2017), datée
 * du remboursement. Elle s'impute au reversement suivant du même bailleur dans la même agence, à
 * hauteur de son net avant reprise, et le reliquat passe au suivant. Un reversement `cancelled` ou
 * `failed` rend ses imputations (`release()`).
 *
 * Pas de reprise pour une pièce jamais reversée (la préparation la compte déjà à `montant −
 * refund_amount`), ni pour un reversement pas encore `completed` (TCK-1158 le bloque), ni pour un
 * pivot sans copie (antérieur à TCK-2017 : il se lit au jour, la reprise compterait le remboursement
 * deux fois).
 *
 * Les tables se lisent par le constructeur de requêtes : un modèle de premier niveau neuf demande sa
 * place dans `docs/models-spec.md` (`check-models-spec.mjs`), que le ticket ne touche pas.
 */
final class PayoutClawbacks
{
    public const TABLE = 'payout_clawbacks';

    public const IMPUTATIONS = 'payout_clawback_imputations';

    /**
     * À appeler DANS la transaction qui écrit le remboursement, après la ligne de la pièce : le
     * reversement porteur se relit sous verrou. `markProcessed` relit les pièces sous le verrou du
     * même reversement : un remboursement concurrent donne soit le refus `payout.items_changed`, soit
     * une reprise.
     */
    public function recordRefund(LeasePayment|BookingPayment $payment, float $refundedPart, CarbonInterface $at): void
    {
        if ($refundedPart <= 0) {
            return;
        }

        [$pivot, $column] = $payment instanceof LeasePayment
            ? ['payout_lease_payment', 'lease_payment_id']
            : ['payout_booking_payment', 'booking_payment_id'];

        $line = DB::table($pivot)
            ->join('payouts', 'payouts.id', '=', "{$pivot}.payout_id")
            ->where("{$pivot}.{$column}", $payment->getKey())
            ->where('payouts.payee_role', PayeeRole::Landlord->value)
            ->whereNotNull("{$pivot}.amount")
            ->whereNotNull("{$pivot}.commission_rate")
            ->select(["{$pivot}.payout_id", "{$pivot}.amount", "{$pivot}.commission_rate"])
            ->first();
        if ($line === null) {
            return;
        }

        /** @var Payout|null $payout */
        $payout = Payout::query()->whereKey($line->payout_id)->lockForUpdate()->first();
        if ($payout === null || $payout->status !== PayoutStatus::Completed) {
            return;
        }

        // La base de la reprise ne dépasse pas ce que le reversement a pris de la pièce, moins ce
        // qu'une reprise précédente en a déjà repris.
        $already = (float) DB::table(self::TABLE)
            ->where('source_payout_id', $payout->id)
            ->where('refunded_payment_type', $payment::class)
            ->where('refunded_payment_id', $payment->getKey())
            ->sum('refund_amount');
        $currency = $payout->currency instanceof Currency ? $payout->currency : Currency::default();
        $base = Currency::roundAmount(min($refundedPart, max(0.0, (float) $line->amount - $already)), $currency);
        if ($base <= 0) {
            return;
        }

        $rate = (float) $line->commission_rate;
        $commission = Currency::roundAmount($base * $rate / 100, $currency);
        $now = now();

        DB::table(self::TABLE)->insert([
            'agency_id' => $payout->agency_id,
            'landlord_id' => $payout->landlord_id,
            'refunded_payment_type' => $payment::class,
            'refunded_payment_id' => $payment->getKey(),
            'part' => 'payment',
            'source_payout_id' => $payout->id,
            'refund_amount' => $base,
            'commission_rate' => $rate,
            'commission_amount' => $commission,
            'amount' => Currency::roundAmount($base - $commission, $currency),
            'currency' => $currency->value,
            'refunded_at' => $at,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    /**
     * Les reprises encore dues d'un bailleur dans une agence, de la plus ancienne à la plus récente,
     * avec leur reste dû : `amount − imputations des reversements qui gardent leurs pièces −
     * settled_amount`. Une reprise soldée à la main n'est plus imputée.
     *
     * @return Collection<int, object{id: int, remaining: float}>
     */
    public function outstanding(int $agencyId, int $landlordId, bool $lock = false): Collection
    {
        $query = DB::table(self::TABLE)
            ->where('agency_id', $agencyId)
            ->where('landlord_id', $landlordId)
            ->whereNull('settled_at')
            ->orderBy('refunded_at')
            ->orderBy('id');
        if ($lock) {
            $query->lockForUpdate();
        }
        $rows = $query->get(['id', 'amount']);
        if ($rows->isEmpty()) {
            return collect();
        }

        $imputed = DB::table(self::IMPUTATIONS)
            ->join('payouts', 'payouts.id', '=', self::IMPUTATIONS.'.payout_id')
            ->whereIn(self::IMPUTATIONS.'.payout_clawback_id', $rows->pluck('id'))
            ->whereIn('payouts.status', array_map(fn (PayoutStatus $s) => $s->value, PayoutStatus::holdingItems()))
            ->groupBy(self::IMPUTATIONS.'.payout_clawback_id')
            ->selectRaw(self::IMPUTATIONS.'.payout_clawback_id AS id, SUM('.self::IMPUTATIONS.'.amount) AS total')
            ->pluck('total', 'id');

        return $rows
            ->map(fn (object $row): object => (object) [
                'id' => (int) $row->id,
                'remaining' => round((float) $row->amount - (float) ($imputed[$row->id] ?? 0), 2),
            ])
            ->filter(fn (object $row): bool => $row->remaining > 0)
            ->values();
    }

    /**
     * Ce qu'un reversement neuf impute, à hauteur de son net avant reprise.
     *
     * @param  Collection<int, object{id: int, remaining: float}>  $outstanding
     * @return array{0: array<int, float>, 1: float} imputations par reprise, total imputé
     */
    public function plan(Collection $outstanding, float $netBeforeClawback): array
    {
        $left = max(0.0, $netBeforeClawback);
        $plan = [];
        foreach ($outstanding as $row) {
            if ($left <= 0) {
                break;
            }
            $take = min($row->remaining, $left);
            $plan[$row->id] = $take;
            $left = round($left - $take, 2);
        }

        return [$plan, round(array_sum($plan), 2)];
    }

    /** @param  array<int, float>  $plan */
    public function impute(Payout $payout, array $plan): void
    {
        $now = now();
        foreach ($plan as $clawbackId => $amount) {
            DB::table(self::IMPUTATIONS)->insert([
                'payout_id' => $payout->id,
                'payout_clawback_id' => $clawbackId,
                'amount' => $amount,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    /** Un reversement `cancelled` ou `failed` rend ses reprises (point 2.7). */
    public function release(Payout $payout): void
    {
        DB::table(self::IMPUTATIONS)->where('payout_id', $payout->id)->delete();
    }

    /**
     * Les reprises d'un périmètre datées de la période (`refunded_at`) : le versé négatif du relevé
     * et de l'accueil (point 4).
     *
     * @return Collection<int, object>
     */
    public function datedIn(string $column, int $id, CarbonInterface $from, CarbonInterface $to, ?int $agencyId = null): Collection
    {
        return DB::table(self::TABLE)
            ->where($column, $id)
            ->when($agencyId !== null, fn ($q) => $q->where('agency_id', $agencyId))
            ->whereBetween('refunded_at', [$from->copy()->startOfDay(), $to->copy()->endOfDay()])
            ->orderBy('refunded_at')
            ->orderBy('id')
            ->get();
    }
}
