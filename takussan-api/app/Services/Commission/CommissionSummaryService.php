<?php

namespace App\Services\Commission;

use App\Models\CommissionEntry;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * TCK-2661 (ADR-0049 §3) — le point des commissions PAR BÉNÉFICIAIRE : ce qu'on lui doit (montant,
 * nombre de lignes, la plus ancienne), ce qu'on lui a payé sur le mois et sur l'année, et son
 * dernier paiement. Le périmètre est celui du relevé, `CommissionEntry::scopeVisibleTo` : l'admin
 * lit toute l'agence, l'agent sa seule entrée. Deux requêtes, quel que soit le nombre de
 * bénéficiaires.
 *
 * Les mois et années se lisent à l'heure de Dakar. Les montants s'additionnent sans conversion de
 * devise, comme `meta.totals` du relevé : une agence travaille en une devise.
 */
class CommissionSummaryService
{
    /**
     * @return list<array{beneficiary: array{id: int, name: string}, due_amount: float, due_count: int, oldest_due_earned_at: ?CarbonImmutable, paid_month: float, paid_year: float, last_paid: ?array{at: CarbonImmutable, method: ?string}}>
     */
    public function forUser(User $user, string $month, string $year): array
    {
        $tz = CommissionEntry::DATE_TIMEZONE;
        $appTz = config('app.timezone');
        $monthStart = CarbonImmutable::createFromFormat('!Y-m', $month, $tz)->setTimezone($appTz);
        $yearStart = CarbonImmutable::createFromFormat('!Y', $year, $tz)->setTimezone($appTz);
        $due = CommissionEntryStatus::Due->value;
        $paid = CommissionEntryStatus::Paid->value;

        $rows = CommissionEntry::query()->visibleTo($user)
            ->toBase()
            ->selectRaw('beneficiary_id')
            ->selectRaw('COALESCE(SUM(amount) FILTER (WHERE status = ?), 0) AS due_amount', [$due])
            ->selectRaw('COUNT(*) FILTER (WHERE status = ?) AS due_count', [$due])
            ->selectRaw('MIN(earned_at) FILTER (WHERE status = ?) AS oldest_due_earned_at', [$due])
            ->selectRaw('COALESCE(SUM(amount) FILTER (WHERE status = ? AND paid_at >= ? AND paid_at < ?), 0) AS paid_month', [$paid, $monthStart, $monthStart->addMonth()])
            ->selectRaw('COALESCE(SUM(amount) FILTER (WHERE status = ? AND paid_at >= ? AND paid_at < ?), 0) AS paid_year', [$paid, $yearStart, $yearStart->addYear()])
            ->groupBy('beneficiary_id')
            ->get();

        if ($rows->isEmpty()) {
            return [];
        }

        // Le dernier paiement de chacun : une ligne par bénéficiaire (`DISTINCT ON`).
        $lastPaid = CommissionEntry::query()->visibleTo($user)
            ->toBase()
            ->where('status', $paid)
            ->whereNotNull('paid_at')
            ->selectRaw('DISTINCT ON (beneficiary_id) beneficiary_id, paid_at, payment_method')
            ->orderBy('beneficiary_id')
            ->orderByDesc('paid_at')
            ->orderByDesc('id')
            ->get()
            ->keyBy('beneficiary_id');

        $users = User::query()->withTrashed()->whereKey($rows->pluck('beneficiary_id')->all())
            ->get(['id', 'first_name', 'last_name', 'username'])->keyBy('id');

        $out = $rows->map(function (object $row) use ($lastPaid, $users): array {
            $id = (int) $row->beneficiary_id;
            $person = $users->get($id);
            $last = $lastPaid->get($row->beneficiary_id);

            return [
                'beneficiary' => ['id' => $id, 'name' => $person !== null ? ($person->full_name ?: (string) $person->username) : ''],
                'due_amount' => round((float) $row->due_amount, 2),
                'due_count' => (int) $row->due_count,
                'oldest_due_earned_at' => $row->oldest_due_earned_at !== null ? CarbonImmutable::parse($row->oldest_due_earned_at, config('app.timezone')) : null,
                'paid_month' => round((float) $row->paid_month, 2),
                'paid_year' => round((float) $row->paid_year, 2),
                'last_paid' => $last !== null ? ['at' => CarbonImmutable::parse($last->paid_at, config('app.timezone')), 'method' => $last->payment_method] : null,
            ];
        });

        // Le plus dû d'abord ; à montant égal, par identifiant (ordre stable).
        $out = $out->all();
        usort($out, fn (array $a, array $b) => [$b['due_amount'], $a['beneficiary']['id']] <=> [$a['due_amount'], $b['beneficiary']['id']]);

        return $out;
    }
}
