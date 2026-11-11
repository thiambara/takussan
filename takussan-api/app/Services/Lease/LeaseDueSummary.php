<?php

namespace App\Services\Lease;

use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Reporting\OverdueInstalment;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * TCK-2642 — le résumé d'échéance d'un bail (`include=due_summary`), posé pour une page en UNE
 * requête, sur les échéances que le locataire doit encore (la règle *Impayé*,
 * {@see CollectedPayments::leaseOwed()} : dues, hors restitution de caution) :
 *
 * - `overdue_count` / `overdue_amount` : celles en retard, à la règle de l'historique et de la
 *   balance âgée ({@see OverdueInstalment::daysLate()} — échue avant aujourd'hui, heure de Dakar),
 *   comptées au RESTE DÛ. C'est ce que la fiche recomptait sur `is_overdue` (`LeaseDetail.tsx`) ;
 * - `next_due` : la prochaine à venir (échéance aujourd'hui ou plus tard, reste dû > 0) —
 *   `{due_date, amount, status}`, `amount` au reste dû ; `null` s'il n'y en a pas.
 */
final class LeaseDueSummary
{
    /** @param  Collection<int, Lease>  $leases */
    public static function attach(Collection $leases): void
    {
        if ($leases->isEmpty()) {
            return;
        }

        $today = OverdueInstalment::today();
        $owed = CollectedPayments::leaseOwed()
            ->whereIn('lease_payments.lease_id', $leases->map(fn (Lease $l) => $l->getKey())->all())
            ->orderBy('lease_payments.due_date')
            ->orderBy('lease_payments.id')
            ->get()
            ->groupBy('lease_id');

        foreach ($leases as $lease) {
            /** @var Collection<int, LeasePayment> $payments */
            $payments = $owed->get($lease->getKey(), collect());
            $overdue = $payments->filter(fn (LeasePayment $p) => OverdueInstalment::daysLate($p, $today) !== null);
            $next = $payments->first(fn (LeasePayment $p) => $p->due_date !== null
                && $p->due_date->toDateString() >= $today && (float) $p->remaining_amount > 0);

            $lease->setDueSummary([
                'next_due' => $next === null ? null : [
                    'due_date' => CarbonImmutable::parse($next->due_date),
                    'amount' => round((float) $next->remaining_amount, 2),
                    'status' => $next->status->value,
                ],
                'overdue_count' => $overdue->count(),
                'overdue_amount' => round((float) $overdue->sum(fn (LeasePayment $p) => (float) $p->remaining_amount), 2),
            ]);
        }
    }
}
