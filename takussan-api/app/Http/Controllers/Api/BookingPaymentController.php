<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\RefundBookingPaymentRequest;
use App\Http\Requests\Api\StoreBookingPaymentRequest;
use App\Http\Resources\BookingPaymentResource;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\PaymentStatus;
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
        $this->authorizeBookingAccess($request, $booking);

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
        $bookingAgencyId = $booking->agency_id ?? $booking->property?->agency_id;
        $isStaff = $user->isSuperAdmin()
            || ($bookingAgencyId !== null && (
                $user->isAgencyAdminAt((int) $bookingAgencyId)
                || $user->isAgentAt((int) $bookingAgencyId)
                || $user->isOwnerAt((int) $bookingAgencyId)
            ));
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
        $this->authorizeBookingAccess($request, $payment->booking);
        abort_unless(
            $payment->status === PaymentStatus::Paid,
            422,
            'La quittance est disponible uniquement pour un paiement acquitté.'
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

    protected function authorizeBookingAccess(Request $request, Booking $booking): void
    {
        $user = $request->user();
        $property = $booking->property;
        $ok = $user->isSuperAdmin()
            || $booking->created_by_id === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $user->agency_id === $booking->agency_id)
            || ($booking->customer && $booking->customer->user_id === $user->id);

        abort_unless($ok, 403);
    }
}
