<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\PayoutResource;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PayoutController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Payout::query()->with('landlord');

        if (! $user->hasRole(['admin', 'super_admin'])) {
            $query->where(function ($q) use ($user) {
                $q->where('landlord_id', $user->id)
                    ->orWhere('issued_by_id', $user->id);
                if ($user->agency_id) {
                    $q->orWhere('agency_id', $user->agency_id);
                }
            });
        }

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $paginator = $query->latest()->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => PayoutResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        abort_unless(
            $user->hasRole(['admin', 'super_admin']) || $user->agency_id,
            403,
            'Only agency members or admins can issue payouts.'
        );

        $data = $request->validate([
            'landlord_id' => ['required', 'exists:users,id'],
            'lease_id' => ['nullable', 'exists:leases,id'],
            'booking_id' => ['nullable', 'exists:bookings,id'],
            'period_start' => ['nullable', 'date'],
            'period_end' => ['nullable', 'date', 'after_or_equal:period_start'],
            'gross_amount' => ['required', 'numeric', 'min:0'],
            'commission_amount' => ['nullable', 'numeric', 'min:0'],
            'fees_amount' => ['nullable', 'numeric', 'min:0'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
            'scheduled_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        $landlord = User::findOrFail($data['landlord_id']);
        abort_if(
            $user->agency_id && $landlord->agency_id && $landlord->agency_id !== $user->agency_id,
            403,
            'Landlord does not belong to your agency.'
        );

        $gross = (float) $data['gross_amount'];
        $commission = isset($data['commission_amount']) ? (float) $data['commission_amount'] : 0;
        $fees = isset($data['fees_amount']) ? (float) $data['fees_amount'] : 0;
        $net = round($gross - $commission - $fees, 2);

        abort_if($net < 0, 422, 'Net amount cannot be negative.');

        $payout = Payout::create([
            'landlord_id' => $landlord->id,
            'lease_id' => $data['lease_id'] ?? null,
            'booking_id' => $data['booking_id'] ?? null,
            'agency_id' => $user->agency_id,
            'issued_by_id' => $user->id,
            'reference_number' => 'PO-'.now()->format('Ym').'-'.strtoupper(Str::random(6)),
            'status' => isset($data['scheduled_at']) ? PayoutStatus::Scheduled->value : PayoutStatus::Pending->value,
            'period_start' => $data['period_start'] ?? null,
            'period_end' => $data['period_end'] ?? null,
            'gross_amount' => $gross,
            'commission_amount' => $commission,
            'fees_amount' => $fees ?: null,
            'net_amount' => $net,
            'currency' => $data['currency'] ?? 'XOF',
            'payment_method' => $data['payment_method'] ?? null,
            'scheduled_at' => $data['scheduled_at'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);

        return $this->json([
            'data' => PayoutResource::make($payout)->toArray($request),
        ], 201);
    }

    public function show(Request $request, Payout $payout): JsonResponse
    {
        $this->authorizeAccess($request, $payout);

        return $this->json([
            'data' => PayoutResource::make($payout->load('landlord'))->toArray($request),
        ]);
    }

    public function markProcessed(Request $request, Payout $payout): JsonResponse
    {
        $this->authorizeManage($request, $payout);
        abort_unless(
            in_array($payout->status, [PayoutStatus::Pending, PayoutStatus::Scheduled, PayoutStatus::Processing], true),
            422,
            'Payout cannot be marked processed in its current state.'
        );

        $data = $request->validate([
            'transaction_id' => ['nullable', 'string'],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
        ]);

        $payout->update([
            'status' => PayoutStatus::Completed,
            'processed_at' => now(),
            'transaction_id' => $data['transaction_id'] ?? $payout->transaction_id,
            'payment_method' => $data['payment_method'] ?? $payout->payment_method,
        ]);

        return $this->json([
            'data' => PayoutResource::make($payout->refresh())->toArray($request),
        ]);
    }

    public function markFailed(Request $request, Payout $payout): JsonResponse
    {
        $this->authorizeManage($request, $payout);
        abort_if(
            in_array($payout->status, [PayoutStatus::Completed, PayoutStatus::Cancelled], true),
            422,
            'Payout cannot be marked failed in its current state.'
        );

        $data = $request->validate([
            'failed_reason' => ['required', 'string'],
        ]);

        $payout->update([
            'status' => PayoutStatus::Failed,
            'failed_reason' => $data['failed_reason'],
        ]);

        return $this->json([
            'data' => PayoutResource::make($payout->refresh())->toArray($request),
        ]);
    }

    public function cancel(Request $request, Payout $payout): JsonResponse
    {
        $this->authorizeManage($request, $payout);
        abort_if(
            in_array($payout->status, [PayoutStatus::Completed, PayoutStatus::Cancelled], true),
            422,
            'Payout cannot be cancelled in its current state.'
        );

        $payout->update(['status' => PayoutStatus::Cancelled]);

        return $this->json([
            'data' => PayoutResource::make($payout->refresh())->toArray($request),
        ]);
    }

    protected function authorizeAccess(Request $request, Payout $payout): void
    {
        $user = $request->user();
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $payout->landlord_id === $user->id
            || $payout->issued_by_id === $user->id
            || ($user->agency_id && $user->agency_id === $payout->agency_id);

        abort_unless($ok, 403);
    }

    protected function authorizeManage(Request $request, Payout $payout): void
    {
        $user = $request->user();
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $payout->issued_by_id === $user->id
            || ($user->agency_id && $user->agency_id === $payout->agency_id);

        abort_unless($ok, 403);
    }
}
