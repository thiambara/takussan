<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\PayoutResource;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentMethod;
use App\Models\Payout;
use App\Models\User;
use App\Services\Model\PayoutService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PayoutController extends Controller
{
    public function __construct(protected PayoutService $payouts) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = Payout::query()->with('landlord');

        if (! $user->hasRole(['admin', 'super_admin'])) {
            $base->where(function ($q) use ($user) {
                $q->where('landlord_id', $user->id)
                    ->orWhere('issued_by_id', $user->id);
                if ($user->agency_id) {
                    $q->orWhere('agency_id', $user->agency_id);
                }
            });
        }

        $paginator = Payout::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

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
        $payout = $this->payouts->create($request->user(), $landlord, $data);

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

        $data = $request->validate([
            'transaction_id' => ['nullable', 'string'],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
        ]);

        $payout = $this->payouts->markProcessed($payout, $data);

        return $this->json([
            'data' => PayoutResource::make($payout)->toArray($request),
        ]);
    }

    public function markFailed(Request $request, Payout $payout): JsonResponse
    {
        $this->authorizeManage($request, $payout);

        $data = $request->validate([
            'failed_reason' => ['required', 'string'],
        ]);

        $payout = $this->payouts->markFailed($payout, $data);

        return $this->json([
            'data' => PayoutResource::make($payout)->toArray($request),
        ]);
    }

    public function cancel(Request $request, Payout $payout): JsonResponse
    {
        $this->authorizeManage($request, $payout);
        $payout = $this->payouts->cancel($payout);

        return $this->json([
            'data' => PayoutResource::make($payout)->toArray($request),
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
