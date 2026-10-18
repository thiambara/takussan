<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\BookingPayment;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Services\Payments\PaymentGatewayService;
use App\Support\DayRange;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

/**
 * GET /api/payments/history — consolidated history across BookingPayment and LeasePayment.
 *
 * TCK-940 (P46.01) — `POST /api/payments`, le routeur unifié, est retiré : un paiement se crée par
 * les voies imbriquées du bail et de la réservation, sous leurs policies.
 */
class PaymentController extends Controller
{
    public function __construct(protected PaymentGatewayService $gateway) {}

    /**
     * Consolidated payment history across BookingPayments and LeasePayments.
     *
     * Supported filters:
     *   - filter[entity_type]={property|lease|customer|booking}
     *   - filter[entity_id]=<id>
     *   - filter[status]=<PaymentStatus>
     *   - filter[date_from]=YYYY-MM-DD
     *   - filter[date_to]=YYYY-MM-DD
     *   - per_page=<int> (default 20, max 100)
     *   - sort=-date|date|-amount|amount (default -date)
     */
    public function history(Request $request): JsonResponse
    {
        $user = $request->user();
        $filters = (array) $request->input('filter', []);

        $bookingQuery = BookingPayment::query()
            ->with('booking.property')
            ->when(! $user->isSuperAdmin(), function ($q) use ($user): void {
                $q->whereHas('booking', function ($bq) use ($user): void {
                    $bq->where(function ($inner) use ($user): void {
                        $inner->where('created_by_id', $user->id)
                            ->orWhereHas('property', fn ($p) => $p->where('user_id', $user->id));
                        // TCK-587 — le personnel de l'agence, plus tout membre (ADR-0031).
                        if (($staffAgencyId = $user->staffAgencyId()) !== null) {
                            $inner->orWhere('agency_id', $staffAgencyId);
                        }
                        $inner->orWhereHas('customer', fn ($c) => $c->where('user_id', $user->id));
                    });
                });
            });

        $leaseQuery = LeasePayment::query()
            ->with(['lease.property', 'lease.agency'])
            ->when(! $user->isSuperAdmin(), function ($q) use ($user): void {
                $q->whereHas('lease', function ($lq) use ($user): void {
                    $lq->where(function ($inner) use ($user): void {
                        $inner->where('landlord_id', $user->id);
                        if (($staffAgencyId = $user->staffAgencyId()) !== null) {
                            $inner->orWhere('agency_id', $staffAgencyId);
                        }
                        $inner->orWhereHas('tenant', fn ($c) => $c->where('user_id', $user->id));
                    });
                });
            });

        // Entity-scoped filtering
        $entityType = isset($filters['entity_type']) ? strtolower((string) $filters['entity_type']) : null;
        $entityId = $filters['entity_id'] ?? null;

        if ($entityType && $entityId) {
            $this->applyEntityFilter($bookingQuery, $leaseQuery, $entityType, (int) $entityId);
        }

        // Status filter — TCK-593 : une liste séparée par des virgules (`pending,late,failed`), pour
        // que le locataire obtienne « ce que je dois » sans filtrer côté client.
        if (! empty($filters['status'])) {
            $statuses = array_map(
                fn (string $value) => PaymentStatus::tryFrom(trim($value)),
                explode(',', (string) $filters['status']),
            );
            if (in_array(null, $statuses, true)) {
                abort_code(422, 'payment.filter_status_invalid');
            }
            $bookingQuery->whereIn('status', $statuses);
            $leaseQuery->whereIn('status', $statuses);
        }

        // Date range — use paid_at for booking payments and paid_at/due_date/period_start for lease payments.
        if (! empty($filters['date_from'])) {
            $from = $filters['date_from'];
            $bookingQuery->where(function ($q) use ($from): void {
                $q->where('paid_at', '>=', DayRange::start($from))->orWhere('created_at', '>=', DayRange::start($from));
            });
            $leaseQuery->where(function ($q) use ($from): void {
                $q->where('paid_at', '>=', DayRange::start($from))->orWhereDate('period_start', '>=', $from);
            });
        }
        if (! empty($filters['date_to'])) {
            $to = $filters['date_to'];
            $bookingQuery->where(function ($q) use ($to): void {
                $q->where('paid_at', '<', DayRange::after($to))->orWhere('created_at', '<', DayRange::after($to));
            });
            $leaseQuery->where(function ($q) use ($to): void {
                $q->where('paid_at', '<', DayRange::after($to))->orWhereDate('period_start', '<=', $to);
            });
        }

        // Pagination
        $perPage = min(max((int) $request->input('per_page', 20), 1), 100);
        $page = max((int) $request->input('page', 1), 1);
        $sort = (string) $request->input('sort', '-date');

        // Hard cap to keep the merge-in-PHP strategy bounded. Beyond this the
        // caller must narrow the filter (entity, date range, status). The
        // `meta.truncated` flag warns that totals are computed on the capped
        // slice only.
        $maxRows = self::HISTORY_HARD_LIMIT;
        $bookingCount = (clone $bookingQuery)->toBase()->getCountForPagination();
        $leaseCount = (clone $leaseQuery)->toBase()->getCountForPagination();
        $truncated = ($bookingCount + $leaseCount) > $maxRows;

        $bookingRows = $bookingQuery->limit($maxRows)->get()
            ->map(fn (BookingPayment $p) => $this->bookingRow($p));
        $leaseRows = $leaseQuery->limit($maxRows)->get()
            ->map(fn (LeasePayment $p) => $this->leaseRow($p));

        $merged = $bookingRows->concat($leaseRows)->values();
        $merged = $this->applySort($merged, $sort);

        if ($merged->count() > $maxRows) {
            $merged = $merged->take($maxRows)->values();
            $truncated = true;
        }

        $total = $merged->count();
        $items = $merged->slice(($page - 1) * $perPage, $perPage)->values();

        // Totals across the (potentially truncated) filtered dataset.
        $totals = [
            'count' => $total,
            'amount' => round((float) $merged->sum('amount'), 2),
            'paid_amount' => round((float) $merged->sum('paid_amount'), 2),
            'remaining_amount' => round((float) $merged->sum('remaining_amount'), 2),
        ];

        $paginator = new LengthAwarePaginator(
            items: $items,
            total: $total,
            perPage: $perPage,
            currentPage: $page,
        );

        return $this->json([
            'data' => $items->all(),
            'meta' => $this->paginationMeta($paginator, [
                'totals' => $totals,
                'truncated' => $truncated,
                'limit' => $maxRows,
            ]),
        ]);
    }

    protected const HISTORY_HARD_LIMIT = 5000;

    /**
     * @param  Builder<BookingPayment>  $bookingQuery
     * @param  Builder<LeasePayment>  $leaseQuery
     */
    protected function applyEntityFilter($bookingQuery, $leaseQuery, string $entityType, int $entityId): void
    {
        switch ($entityType) {
            case 'booking':
                $bookingQuery->where('booking_id', $entityId);
                $leaseQuery->whereRaw('1 = 0'); // exclude lease payments
                break;

            case 'lease':
                $leaseQuery->where('lease_id', $entityId);
                $bookingQuery->whereRaw('1 = 0');
                break;

            case 'customer':
                $bookingQuery->whereHas('booking', fn ($q) => $q->where('customer_id', $entityId));
                $leaseQuery->where('payer_id', $entityId);
                break;

            case 'property':
                abort_code_unless(Property::whereKey($entityId)->exists(), 404, 'property.not_found');
                $bookingQuery->whereHas('booking', fn ($q) => $q->where('property_id', $entityId));
                $leaseQuery->whereHas('lease', fn ($q) => $q->where('property_id', $entityId));
                break;

            default:
                abort_code(422, 'payment.filter_entity_invalid');
        }
    }

    /**
     * @return array<string, mixed>
     */
    protected function bookingRow(BookingPayment $p): array
    {
        $booking = $p->booking;

        return [
            'source' => 'booking',
            'id' => $p->id,
            'reference_number' => $p->reference_number,
            'amount' => (float) $p->amount,
            'currency' => $p->currency?->value,
            'payment_method' => $p->payment_method?->value,
            'payment_type' => $p->payment_type?->value,
            'status' => $p->status?->value,
            'paid_amount' => (float) $p->paid_amount,
            'remaining_amount' => (float) $p->remaining_amount,
            'date' => ($p->paid_at ?? $p->created_at)?->toISOString(),
            'paid_at' => $p->paid_at?->toISOString(),
            'booking_id' => $p->booking_id,
            'lease_id' => null,
            'property_id' => $booking?->property_id,
            'customer_id' => $booking?->customer_id,
            'created_at' => $p->created_at?->toISOString(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function leaseRow(LeasePayment $p): array
    {
        $lease = $p->lease;

        return [
            'source' => 'lease',
            'id' => $p->id,
            'reference_number' => $p->reference_number,
            'amount' => (float) $p->amount,
            'currency' => $p->currency?->value,
            'payment_method' => $p->payment_method?->value,
            'payment_type' => $p->payment_type?->value,
            'status' => $p->status?->value,
            'paid_amount' => (float) $p->paid_amount,
            'remaining_amount' => (float) $p->remaining_amount,
            // TCK-593 — la même lecture que `LeasePaymentResource` : l'historique ne refait aucun calcul.
            'late_fee_amount' => $p->late_fee_amount !== null ? (float) $p->late_fee_amount : null,
            'late_fee_outstanding' => $p->lateFeeOutstanding(),
            'late_fee_payable_online' => $this->gateway->lateFeeIncluded($p),
            'amount_due' => (float) ($this->gateway->amountDue($p) ?? 0),
            'date' => ($p->paid_at ?? $p->period_start?->startOfDay() ?? $p->created_at)?->toISOString(),
            'paid_at' => $p->paid_at?->toISOString(),
            'period_start' => $p->period_start?->toDateString(),
            'period_end' => $p->period_end?->toDateString(),
            'due_date' => $p->due_date?->toDateString(),
            'booking_id' => null,
            'lease_id' => $p->lease_id,
            'property_id' => $lease?->property_id,
            'customer_id' => $p->payer_id,
            'created_at' => $p->created_at?->toISOString(),
        ];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return Collection<int, array<string, mixed>>
     */
    protected function applySort(Collection $rows, string $sort): Collection
    {
        $desc = str_starts_with($sort, '-');
        $field = ltrim($sort, '-');
        $allowed = ['date', 'amount', 'remaining_amount', 'created_at'];
        if (! in_array($field, $allowed, true)) {
            $field = 'date';
            $desc = true;
        }

        return $desc
            ? $rows->sortByDesc($field)->values()
            : $rows->sortBy($field)->values();
    }
}
