<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\InitiatePaymentRequest;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\PaymentProvider;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Initiate a checkout session and (optionally) force-verify a payment.
 * Routes are wired with both `payment_type` polymorphic resolution and
 * the dedicated booking-/lease-payment binding.
 */
class PaymentGatewayController extends Controller
{
    public function __construct(protected PaymentGatewayService $gateway) {}

    public function initiate(InitiatePaymentRequest $request, string $paymentType, int $paymentId): JsonResponse
    {
        $payment = $this->resolvePayment($paymentType, $paymentId);
        // TCK-306 — le `instanceof` sur trois types est devenu trois policies ;
        // Laravel choisit celle qui s'applique sur la classe reelle du paiement.
        abort_if($request->user() === null, 401);
        $this->authorize('update', $payment);

        $provider = PaymentProvider::from($request->validated()['provider']);

        $session = $this->gateway->initiate($payment, $provider, [
            'return_url' => $request->validated()['return_url'] ?? null,
            'cancel_url' => $request->validated()['cancel_url'] ?? null,
        ]);

        return $this->json([
            'data' => [
                'checkout_url' => $session->checkoutUrl,
                'transaction_id' => $session->transactionId,
                'provider' => $session->provider,
            ],
        ]);
    }

    public function verify(Request $request, string $paymentType, int $paymentId): JsonResponse
    {
        $payment = $this->resolvePayment($paymentType, $paymentId);
        abort_if($request->user() === null, 401);
        $this->authorize('update', $payment);

        $status = $this->gateway->verify($payment);

        return $this->json([
            'data' => [
                'status' => $payment->refresh()->status->value ?? null,
                'provider_status' => $status?->status,
                'transaction_id' => $payment->transaction_id,
            ],
        ]);
    }

    protected function resolvePayment(string $type, int $id): Model
    {
        $model = match ($type) {
            'booking-payments' => BookingPayment::query()->findOrFail($id),
            'lease-payments' => LeasePayment::query()->findOrFail($id),
            'invoices' => Invoice::query()->findOrFail($id),
            default => abort(404, 'Unknown payment type.'),
        };

        return $model;
    }
}
