<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\BookingPaymentResource;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BookingPaymentController extends Controller
{
    public function index(Request $request, Booking $booking): JsonResponse
    {
        $this->authorizeBookingAccess($request, $booking);

        $payments = $booking->payments()
            ->latest()
            ->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => BookingPaymentResource::collection($payments)->toArray($request),
            'meta' => [
                'total' => $payments->total(),
                'current_page' => $payments->currentPage(),
                'last_page' => $payments->lastPage(),
            ],
        ]);
    }

    public function store(Request $request, Booking $booking): JsonResponse
    {
        $this->authorizeBookingManage($request, $booking);

        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0'],
            'payment_type' => ['required', Rule::enum(BookingPaymentType::class)],
            'payment_method' => ['nullable', Rule::enum(PaymentMethod::class)],
            'paid_at' => ['nullable', 'date'],
            'transaction_id' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ]);

        $paidAt = $data['paid_at'] ?? now();

        $payment = $booking->payments()->create([
            'payer_id' => $booking->customer_id,
            'collector_id' => $request->user()->id,
            'reference_number' => 'BPY-'.strtoupper(Str::random(8)),
            'receipt_number' => 'RCP-'.strtoupper(Str::random(6)),
            'amount' => $data['amount'],
            'currency' => $booking->currency?->value ?? 'XOF',
            'payment_type' => $data['payment_type'],
            'payment_method' => $data['payment_method'] ?? null,
            'status' => PaymentStatus::Paid->value,
            'paid_at' => $paidAt,
            'transaction_id' => $data['transaction_id'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);

        return $this->json([
            'data' => BookingPaymentResource::make($payment)->toArray($request),
        ], 201);
    }

    public function refund(Request $request, BookingPayment $payment): JsonResponse
    {
        $payment->loadMissing('booking');
        abort_unless($payment->booking, 404);
        $this->authorizeBookingManage($request, $payment->booking);

        abort_unless(
            $payment->status === PaymentStatus::Paid,
            422,
            'Only paid payments can be refunded.'
        );

        $data = $request->validate([
            'refund_amount' => ['required', 'numeric', 'gt:0'],
            'refund_reason' => ['nullable', 'string'],
        ]);

        abort_if(
            (float) $data['refund_amount'] > (float) $payment->amount,
            422,
            'Refund amount cannot exceed the paid amount.'
        );

        $payment->update([
            'status' => PaymentStatus::Refunded->value,
            'refund_amount' => $data['refund_amount'],
            'refund_reason' => $data['refund_reason'] ?? null,
        ]);

        return $this->json([
            'data' => BookingPaymentResource::make($payment->refresh())->toArray($request),
        ]);
    }

    protected function authorizeBookingAccess(Request $request, Booking $booking): void
    {
        $user = $request->user();
        $property = $booking->property;
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $booking->created_by_id === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $user->agency_id === $booking->agency_id)
            || ($booking->customer && $booking->customer->user_id === $user->id);

        abort_unless($ok, 403);
    }

    protected function authorizeBookingManage(Request $request, Booking $booking): void
    {
        $user = $request->user();
        $property = $booking->property;
        $ok = $user->hasRole(['admin', 'super_admin'])
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $user->agency_id === $booking->agency_id);

        abort_unless($ok, 403);
    }
}
