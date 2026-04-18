<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\BookingPaymentResource;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\PaymentMethod;
use App\Services\Model\BookingPaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BookingPaymentController extends Controller
{
    public function __construct(protected BookingPaymentService $payments) {}

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

        $payment = $this->payments->create($booking, $request->user(), $data);

        return $this->json([
            'data' => BookingPaymentResource::make($payment)->toArray($request),
        ], 201);
    }

    public function refund(Request $request, BookingPayment $payment): JsonResponse
    {
        $payment->loadMissing('booking');
        abort_unless($payment->booking, 404);
        $this->authorizeBookingManage($request, $payment->booking);

        $data = $request->validate([
            'refund_amount' => ['required', 'numeric', 'gt:0'],
            'refund_reason' => ['nullable', 'string'],
        ]);

        $payment = $this->payments->refund($payment, $data);

        return $this->json([
            'data' => BookingPaymentResource::make($payment)->toArray($request),
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
