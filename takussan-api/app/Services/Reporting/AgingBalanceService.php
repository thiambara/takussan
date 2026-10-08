<?php

namespace App\Services\Reporting;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Dashboard\CollectedPayments;

/**
 * TCK-595 (§7, AD17) — la balance âgée des impayés d'une agence, et les cautions qu'elle détient.
 *
 * La règle est celle de la tuile « Impayés » (*Impayé*, {@see CollectedPayments::leaseOwed()}) :
 * une échéance `pending` OU `late` échue, jamais une restitution de caution. Lire `status = late`
 * seul, comme l'onglet le faisait, rendait vide une agence dont les baux n'ont pas de pénalité de
 * retard : rien ne fait passer leurs loyers à `late`.
 *
 * Deux requêtes groupées pour la balance (tranches, puis noms), une pour les cautions, quel que
 * soit le nombre de locataires ou de bailleurs.
 */
class AgingBalanceService
{
    public const GROUP_TENANT = 'tenant';

    public const GROUP_LANDLORD = 'landlord';

    /** Tranches de retard, en jours (bornes incluses), dans l'ordre d'affichage. */
    public const BUCKETS = [
        '1_30' => [1, 30],
        '31_60' => [31, 60],
        '61_90' => [61, 90],
        '90_plus' => [91, null],
    ];

    /** @return array<string, mixed> */
    public function forAgency(Agency $agency, string $groupBy = self::GROUP_TENANT): array
    {
        $today = now()->toDateString();
        $key = $groupBy === self::GROUP_LANDLORD ? 'leases.landlord_id' : 'lease_payments.payer_id';

        $case = 'CASE';
        $bindings = [];
        foreach (self::BUCKETS as $label => [$min, $max]) {
            $case .= $max === null
                ? " WHEN (?::date - lease_payments.due_date) >= {$min} THEN '{$label}'"
                : " WHEN (?::date - lease_payments.due_date) BETWEEN {$min} AND {$max} THEN '{$label}'";
            $bindings[] = $today;
        }
        $case .= ' END';

        $rows = CollectedPayments::leaseOwed()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->whereNull('leases.deleted_at')
            ->where('leases.agency_id', $agency->id)
            ->whereDate('lease_payments.due_date', '<', $today)
            ->toBase()
            ->selectRaw("{$key} AS group_id, {$case} AS bucket, COUNT(*) AS n, SUM(".CollectedPayments::OWED_REMAINING_SQL.') AS total', $bindings)
            ->groupBy('group_id', 'bucket')
            ->get();

        $names = $this->names($groupBy, $rows->pluck('group_id')->filter()->unique()->values()->all());

        $empty = fn (): array => array_map(fn () => ['count' => 0, 'amount' => 0.0], self::BUCKETS);
        $buckets = $empty();
        $groups = [];
        foreach ($rows as $row) {
            $id = $row->group_id !== null ? (int) $row->group_id : null;
            $groups[$id ?? 0] ??= ['id' => $id, 'name' => $id !== null ? ($names[$id] ?? null) : null, 'buckets' => $empty()];
            $add = function (array &$cell) use ($row): void {
                $cell['count'] += (int) $row->n;
                $cell['amount'] = round($cell['amount'] + (float) $row->total, 2);
            };
            $add($buckets[$row->bucket]);
            $add($groups[$id ?? 0]['buckets'][$row->bucket]);
        }

        $total = fn (array $b): array => [
            'count' => array_sum(array_column($b, 'count')),
            'amount' => round(array_sum(array_column($b, 'amount')), 2),
        ];
        $groups = array_map(fn (array $g) => $g + ['total' => $total($g['buckets'])], array_values($groups));
        usort($groups, fn (array $a, array $b) => $b['total']['amount'] <=> $a['total']['amount']);

        return [
            'as_of' => $today,
            'group_by' => $groupBy,
            'buckets' => $buckets,
            'total' => $total($buckets),
            'rows' => $groups,
            'deposits_held' => $this->depositsHeld($agency),
        ];
    }

    /**
     * Cautions encaissées moins cautions restituées, payées, sur les baux de l'agence : la règle de
     * `finance.deposits_held` (`PortfolioMetrics::depositsHeld`), au global et par bailleur.
     *
     * @return array{total: float, by_landlord: list<array{landlord_id: int|null, name: string|null, amount: float}>}
     */
    public function depositsHeld(Agency $agency): array
    {
        $byLandlord = LeasePayment::query()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->whereNull('leases.deleted_at')
            ->where('leases.agency_id', $agency->id)
            ->where('lease_payments.status', PaymentStatus::Paid->value)
            ->whereIn('lease_payments.payment_type', [LeasePaymentType::Deposit->value, LeasePaymentType::DepositRefund->value])
            ->toBase()
            ->selectRaw('leases.landlord_id AS landlord_id, SUM(CASE WHEN lease_payments.payment_type = ? THEN lease_payments.amount ELSE -lease_payments.amount END) AS held', [LeasePaymentType::Deposit->value])
            ->groupBy('leases.landlord_id')
            ->get();

        $names = $this->names(self::GROUP_LANDLORD, $byLandlord->pluck('landlord_id')->filter()->unique()->values()->all());
        $rows = $byLandlord
            ->map(fn ($row) => [
                'landlord_id' => $row->landlord_id !== null ? (int) $row->landlord_id : null,
                'name' => $row->landlord_id !== null ? ($names[(int) $row->landlord_id] ?? null) : null,
                'amount' => round((float) $row->held, 2),
            ])
            ->filter(fn (array $row) => $row['amount'] != 0.0)
            ->sortByDesc('amount')
            ->values()
            ->all();

        return ['total' => round(array_sum(array_column($rows, 'amount')), 2), 'by_landlord' => $rows];
    }

    /**
     * @param  list<int|string>  $ids
     * @return array<int, string>
     */
    private function names(string $groupBy, array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $model = $groupBy === self::GROUP_LANDLORD ? User::query() : Customer::query()->withTrashed();

        return $model->whereIn('id', $ids)
            ->get(['id', 'first_name', 'last_name'])
            ->mapWithKeys(fn ($m) => [(int) $m->id => trim($m->first_name.' '.$m->last_name)])
            ->all();
    }
}
