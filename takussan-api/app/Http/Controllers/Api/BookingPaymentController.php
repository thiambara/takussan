<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\RefundBookingPaymentRequest;
use App\Http\Requests\Api\StoreBookingPaymentRequest;
use App\Http\Resources\BookingPaymentResource;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\PaymentStatus;
use App\Services\Booking\BookingMoneyAccess;
use App\Services\Model\BookingPaymentService;
use App\Services\Payments\PaymentReceiptPdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class BookingPaymentController extends Controller
{
    public function __construct(protected BookingPaymentService $payments) {}

    public function index(Request $request, Booking $booking): JsonResponse
    {
        // TCK-587 — la règle de `BookingPolicy::view`, à l'identique : l'ancien helper la recopiait.
        $this->authorize('view', $booking);

        $payments = $booking->payments()
            ->latest()
            ->paginate((int) $request->input('per_page', 20));

        return $this->paginated($payments, BookingPaymentResource::collection($payments)->toArray($request));
    }

    public function store(StoreBookingPaymentRequest $request, Booking $booking): JsonResponse
    {

        $data = $request->validated();

        // TCK-172 — when the customer (not staff) posts the payment, force
        // the status to `pending` so the gateway flow can take it from there;
        // ignore any client-provided shortcut to `paid`.
        $user = $request->user();
        $isCustomer = $booking->customer && $booking->customer->user_id === $user->id;
        // TCK-596 — « bailleur direct du bien », plus `isOwnerAt(agence)` : tout bailleur de
        // l'agence comptait comme encaisseur. Même règle que l'autorisation (`BookingMoneyAccess`).
        $isStaff = BookingMoneyAccess::canRecordAsCollector($user, $booking);
        if ($isCustomer && ! $isStaff) {
            $data['status'] = PaymentStatus::Pending->value;
            $data['paid_at'] = null;
            unset($data['payment_method'], $data['transaction_id']);
        }

        $payment = $this->payments->create($booking, $user, $data);

        return $this->json([
            'data' => BookingPaymentResource::make($payment)->toArray($request),
        ], 201);
    }

    /**
     * TCK-172 — GET /api/booking-payments/{payment}/receipt — PDF download
     * for a paid (acquittée) payment row. Both the customer and the agent
     * can download.
     */
    public function receipt(Request $request, BookingPayment $payment, PaymentReceiptPdf $pdf): Response
    {
        $payment->loadMissing('booking');
        abort_unless($payment->booking, 404);
        $this->authorize('view', $payment->booking);
        abort_code_unless(
            $payment->status === PaymentStatus::Paid,
            422,
            'booking_payment.receipt_unpaid'
        );

        $body = $pdf->forBookingPayment($payment);
        $filename = 'quittance-'.($payment->receipt_number ?? $payment->id).'.pdf';

        return new Response($body, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    public function refund(RefundBookingPaymentRequest $request, BookingPayment $payment): JsonResponse
    {
        $payment->loadMissing('booking');
        abort_unless($payment->booking, 404);

        $data = $request->validated();

        $payment = $this->payments->refund($payment, $data);

        return $this->json([
            'data' => BookingPaymentResource::make($payment)->toArray($request),
        ]);
    }
}
