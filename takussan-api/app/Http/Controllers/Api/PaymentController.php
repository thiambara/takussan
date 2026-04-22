<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\PaymentStoreRequest;
use App\Http\Resources\BookingPaymentResource;
use App\Http\Resources\LeasePaymentResource;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Services\Model\BookingPaymentService;
use App\Services\Model\LeasePaymentService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

/**
 * Unified payment endpoints:
 *   - POST /api/payments        → route a payment to BookingPayment or LeasePayment.
 *   - GET  /api/payments/history → consolidated history across both sources.
 */
class PaymentController extends Controller
{
    public function __construct(
        protected BookingPaymentService $bookingPayments,
        protected LeasePaymentService $leasePayments,
    ) {}

    public function store(PaymentStoreRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = $request->user();

        if ($data['payable_type'] === 'booking') {
            /** @var Booking|null $booking */
            $booking = Booking::find($data['payable_id']);
            abort_unless($booking, 404, 'Booking not found.');
            $this->authorizeBookingManage($user, $booking);

            $payment = $this->bookingPayments->create($booking, $user, [
                'amount' => $data['amount'],
                'payment_type' => $data['payment_type'],
                'payment_method' => $data['payment_method'] ?? null,
                'status' => $data['status'] ?? null,
                'paid_at' => $data['paid_at'] ?? null,
                'transaction_id' => $data['transaction_id'] ?? null,
                'notes' => $data['notes'] ?? null,
            ]);

            return $this->json([
                'data' => BookingPaymentResource::make($payment->refresh())->toArray($request) + [
                    'source' => 'booking',
                ],
            ], 201);
        }

        // Lease
        /** @var Lease|null $lease */
        $lease = Lease::find($data['payable_id']);
        abort_unless($lease, 404, 'Lease not found.');
        $this->authorizeLeaseManage($user, $lease);

        $leaseData = [
            'amount' => $data['amount'],
            'payment_type' => $data['payment_type'],
            'payment_method' => $data['payment_method'] ?? null,
            'period_start' => $data['period_start'],
            'period_end' => $data['period_end'],
            'due_date' => $data['due_date'] ?? null,
            'paid_at' => $data['paid_at'] ?? null,
            'transaction_id' => $data['transaction_id'] ?? null,
            'notes' => $data['notes'] ?? null,
        ];
        // Allow client to declare intent (e.g. paid on receipt, partially paid).
        if (! empty($data['status'])) {
            $leaseData['status'] = $data['status'];
        }
        $payment = $this->leasePayments->create($lease, $user, $leaseData);

        return $this->json([
            'data' => LeasePaymentResource::make($payment->refresh())->toArray($request) + [
                'source' => 'lease',
            ],
        ], 201);
    }

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
            ->when(! $user->hasRole(['admin', 'super_admin']), function ($q) use ($user): void {
                $q->whereHas('booking', function ($bq) use ($user): void {
                    $bq->where(function ($inner) use ($user): void {
                        $inner->where('created_by_id', $user->id)
                            ->orWhereHas('property', fn ($p) => $p->where('user_id', $user->id));
                        if ($user->agency_id) {
                            $inner->orWhere('agency_id', $user->agency_id);
                        }
                        $inner->orWhereHas('customer', fn ($c) => $c->where('user_id', $user->id));
                    });
                });
            });

        $leaseQuery = LeasePayment::query()
            ->with('lease.property')
            ->when(! $user->hasRole(['admin', 'super_admin']), function ($q) use ($user): void {
                $q->whereHas('lease', function ($lq) use ($user): void {
                    $lq->where(function ($inner) use ($user): void {
                        $inner->where('landlord_id', $user->id);
                        if ($user->agency_id) {
                            $inner->orWhere('agency_id', $user->agency_id);
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

        // Status filter
        if (! empty($filters['status'])) {
            $status = PaymentStatus::tryFrom((string) $filters['status']);
            if ($status !== null) {
                $bookingQuery->where('status', $status);
                $leaseQuery->where('status', $status);
            } else {
                abort(422, 'Invalid filter[status].');
            }
        }

        // Date range — use paid_at for booking payments and paid_at/due_date/period_start for lease payments.
        if (! empty($filters['date_from'])) {
            $from = $filters['date_from'];
            $bookingQuery->where(function ($q) use ($from): void {
                $q->whereDate('paid_at', '>=', $from)->orWhereDate('created_at', '>=', $from);
            });
            $leaseQuery->where(function ($q) use ($from): void {
                $q->whereDate('paid_at', '>=', $from)->orWhereDate('period_start', '>=', $from);
            });
        }
        if (! empty($filters['date_to'])) {
            $to = $filters['date_to'];
            $bookingQuery->where(function ($q) use ($to): void {
                $q->whereDate('paid_at', '<=', $to)->orWhereDate('created_at', '<=', $to);
            });
            $leaseQuery->where(function ($q) use ($to): void {
                $q->whereDate('paid_at', '<=', $to)->orWhereDate('period_start', '<=', $to);
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
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'totals' => $totals,
                'truncated' => $truncated,
                'limit' => $maxRows,
            ],
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
                abort_unless(Property::whereKey($entityId)->exists(), 404, 'Property not found.');
                $bookingQuery->whereHas('booking', fn ($q) => $q->where('property_id', $entityId));
                $leaseQuery->whereHas('lease', fn ($q) => $q->where('property_id', $entityId));
                break;

            default:
                abort(422, 'Invalid filter[entity_type].');
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

    protected function authorizeBookingManage($user, Booking $booking): void
    {
        $property = $booking->property;
        $ok = $user->hasRole(['admin', 'super_admin'])
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $user->agency_id === $booking->agency_id);

        abort_unless($ok, 403);
    }

    protected function authorizeLeaseManage($user, Lease $lease): void
    {
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $lease->landlord_id === $user->id
            || ($user->agency_id && $user->agency_id === $lease->agency_id);

        abort_unless($ok, 403);
    }
}
