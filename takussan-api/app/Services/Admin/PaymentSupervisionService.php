<?php

namespace App\Services\Admin;

use App\Models\Enums\PaymentProvider;
use App\Models\IntegrationWebhookLog;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-602 — la supervision des paiements par la console : ce qui a échoué, ce qui est en retard, et
 * les webhooks qui n'ont rien apparié. **Une seule définition de « en échec »**, lue par la liste
 * ET par les compteurs :
 *
 * - `lease_payments` : `metadata.gateway.last_failed_at` posé DANS la période, quel que soit le
 *   statut courant — et JAMAIS `status = failed`, qu'une échéance n'écrit plus depuis TCK-593. Une
 *   ligne rouverte par la migration de 593 (`reopened_from_failed_at`, sans `last_failed_at`) ne
 *   compte pas. Le fournisseur est `metadata.gateway.provider`.
 * - `booking_payments` : `status = failed`, mis à jour dans la période.
 *
 * « En retard » : `status = late` ; pour une échéance, son échéance tombe dans la période.
 */
class PaymentSupervisionService
{
    public const STATUS_FAILED = 'failed';

    public const STATUS_LATE = 'late';

    /** Les fenêtres des compteurs, en jours. */
    public const SUMMARY_WINDOWS = [7, 30];

    /**
     * @param  array{status?: ?string, provider?: ?string, agency_id?: ?int}  $filters
     */
    public function list(array $filters, CarbonInterface $from, CarbonInterface $to, int $perPage): LengthAwarePaginator
    {
        $status = $filters['status'] ?? null;
        $parts = [];
        if ($status === null || $status === self::STATUS_FAILED) {
            $parts[] = $this->failedLeasePayments($from, $to);
            $parts[] = $this->failedBookingPayments($from, $to);
        }
        if ($status === null || $status === self::STATUS_LATE) {
            $parts[] = $this->lateLeasePayments($from, $to);
            $parts[] = $this->lateBookingPayments($from, $to);
        }

        $union = array_shift($parts);
        foreach ($parts as $part) {
            $union->unionAll($part);
        }

        $query = DB::query()->fromSub($union, 'p');
        if (! empty($filters['provider'])) {
            $query->where('p.provider', $filters['provider']);
        }
        if (! empty($filters['agency_id'])) {
            $query->where('p.agency_id', (int) $filters['agency_id']);
        }

        return $query->orderByDesc('p.event_at')->orderByDesc('p.id')->paginate($perPage);
    }

    /**
     * Par fenêtre (7 et 30 jours) et par fournisseur : en échec, en retard, webhooks non appariés.
     *
     * @return array<string, array<string, array{failed: int, late: int, unmatched: int}>>
     */
    public function summary(CarbonInterface $now): array
    {
        $summary = [];
        foreach (self::SUMMARY_WINDOWS as $days) {
            $from = $now->copy()->subDays($days);
            $byProvider = [];
            foreach (PaymentProvider::cases() as $provider) {
                $byProvider[$provider->value] = ['failed' => 0, 'late' => 0, 'unmatched' => 0];
            }

            foreach ([
                'failed' => [$this->failedLeasePayments($from, $now), $this->failedBookingPayments($from, $now)],
                'late' => [$this->lateLeasePayments($from, $now), $this->lateBookingPayments($from, $now)],
            ] as $metric => $queries) {
                foreach ($queries as $q) {
                    foreach (DB::query()->fromSub($q, 'p')->whereNotNull('p.provider')->groupBy('p.provider')->selectRaw('p.provider, COUNT(*) AS n')->get() as $row) {
                        $byProvider[$row->provider] ??= ['failed' => 0, 'late' => 0, 'unmatched' => 0];
                        $byProvider[$row->provider][$metric] += (int) $row->n;
                    }
                }
            }

            $unmatched = IntegrationWebhookLog::query()
                ->where('channel', IntegrationWebhookLog::CHANNEL_PAYMENT)
                ->where('status', IntegrationWebhookLog::STATUS_PROCESSED)
                ->where('matched_count', 0)
                ->where('created_at', '>=', $from)
                ->groupBy('provider')
                ->selectRaw('provider, COUNT(*) AS n')
                ->get();
            foreach ($unmatched as $row) {
                $byProvider[$row->provider] ??= ['failed' => 0, 'late' => 0, 'unmatched' => 0];
                $byProvider[$row->provider]['unmatched'] += (int) $row->n;
            }

            $summary["last_{$days}_days"] = $byProvider;
        }

        return $summary;
    }

    private function failedLeasePayments(CarbonInterface $from, CarbonInterface $to): Builder
    {
        $failedAt = "NULLIF(lp.metadata->'gateway'->>'last_failed_at', '')::timestamptz";

        return $this->leaseBase(self::STATUS_FAILED, $failedAt)
            ->whereRaw("{$failedAt} BETWEEN ? AND ?", [$from, $to]);
    }

    private function lateLeasePayments(CarbonInterface $from, CarbonInterface $to): Builder
    {
        return $this->leaseBase(self::STATUS_LATE, 'lp.due_date::timestamptz')
            ->where('lp.status', 'late')
            ->whereBetween('lp.due_date', [$from->toDateString(), $to->toDateString()]);
    }

    private function failedBookingPayments(CarbonInterface $from, CarbonInterface $to): Builder
    {
        return $this->bookingBase(self::STATUS_FAILED)
            ->where('bp.status', 'failed')
            ->whereBetween('bp.updated_at', [$from, $to]);
    }

    private function lateBookingPayments(CarbonInterface $from, CarbonInterface $to): Builder
    {
        return $this->bookingBase(self::STATUS_LATE)
            ->where('bp.status', 'late')
            ->whereBetween('bp.updated_at', [$from, $to]);
    }

    private function leaseBase(string $kind, string $eventAt): Builder
    {
        return DB::table('lease_payments as lp')
            ->join('leases as l', 'l.id', '=', 'lp.lease_id')
            ->whereNull('lp.deleted_at')
            ->selectRaw("'lease_payment' AS type, ? AS reason, lp.id, lp.reference_number, lp.status, {$this->provider('lp')} AS provider, lp.amount, lp.currency, l.agency_id, {$eventAt} AS event_at, lp.due_date", [$kind]);
    }

    private function bookingBase(string $kind): Builder
    {
        return DB::table('booking_payments as bp')
            ->join('bookings as b', 'b.id', '=', 'bp.booking_id')
            ->whereNull('bp.deleted_at')
            ->selectRaw("'booking_payment' AS type, ? AS reason, bp.id, bp.reference_number, bp.status, {$this->provider('bp')} AS provider, bp.amount, bp.currency, b.agency_id, bp.updated_at::timestamptz AS event_at, NULL::date AS due_date", [$kind]);
    }

    /** Le fournisseur : celui du checkout, à défaut celui que dit le moyen de paiement. */
    private function provider(string $alias): string
    {
        return "COALESCE({$alias}.metadata->'gateway'->>'provider', CASE {$alias}.payment_method"
            ." WHEN 'wave' THEN 'wave' WHEN 'orange_money' THEN 'orange_money' WHEN 'card' THEN 'lemon_squeezy' END)";
    }
}
