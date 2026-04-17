<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\LeasePaymentResource;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class LeasePaymentController extends Controller
{
    public function index(Request $request, Lease $lease): JsonResponse
    {
        $payments = $lease->payments()
            ->orderBy('period_start', 'desc')
            ->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => LeasePaymentResource::collection($payments)->toArray($request),
            'meta' => [
                'total' => $payments->total(),
                'current_page' => $payments->currentPage(),
            ],
        ]);
    }

    public function store(Request $request, Lease $lease): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string'],
            'payment_type' => ['required', 'string'],
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date', 'after_or_equal:period_start'],
            'due_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        $payment = $lease->payments()->create(array_merge($data, [
            'reference_number' => 'LPY-'.strtoupper(Str::random(6)),
            'payer_id' => $lease->tenant_id,
            'collector_id' => $request->user()->id,
            'currency' => $lease->currency?->value ?? 'XOF',
            'status' => PaymentStatus::Pending->value,
        ]));

        return $this->json([
            'data' => LeasePaymentResource::make($payment)->toArray($request),
        ], 201);
    }

    public function markPaid(Request $request, LeasePayment $payment): JsonResponse
    {
        $data = $request->validate([
            'paid_at' => ['nullable', 'date'],
            'payment_method' => ['nullable', 'string'],
            'transaction_id' => ['nullable', 'string'],
        ]);

        $payment->update([
            'status' => PaymentStatus::Paid,
            'paid_at' => $data['paid_at'] ?? now(),
            'payment_method' => $data['payment_method'] ?? $payment->payment_method,
            'transaction_id' => $data['transaction_id'] ?? $payment->transaction_id,
        ]);

        return $this->json([
            'data' => LeasePaymentResource::make($payment->refresh())->toArray($request),
        ]);
    }
}
