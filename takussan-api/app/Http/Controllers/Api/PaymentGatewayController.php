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
        $payment->refresh();

        return $this->json([
            'data' => [
                'status' => $payment->status->value ?? null,
                'provider_status' => $status?->status,
                'transaction_id' => $payment->transaction_id,
                'refund_pending' => $status !== null && $this->isRefundPending($payment, $status->transactionId),
            ],
        ]);
    }

    /**
     * TCK-602 (ADR-0051 §3) — les fournisseurs que CE paiement peut utiliser : une intégration active
     * couvre son agence (repli global compris), un pilote la sert, ses identifiants sont remplis, et
     * le fournisseur accepte la devise. Même autorisation que l'initiation : le locataire qui paie la
     * lit, sans accès à `GET /api/integrations` (réservé à l'admin d'agence). Aucun appel sortant.
     */
    public function providers(Request $request, string $paymentType, int $paymentId): JsonResponse
    {
        $payment = $this->resolvePayment($paymentType, $paymentId);
        abort_if($request->user() === null, 401);
        $this->authorize('update', $payment);

        return $this->json([
            'data' => [
                'providers' => array_map(
                    static fn (PaymentProvider $provider): string => $provider->value,
                    $this->gateway->availableProviders($payment),
                ),
            ],
        ]);
    }

    /**
     * VERIF-596 passe 8 (m-o) — le règlement vérifié a débité le payeur sans rien solder (échéance
     * annulée par un renouvellement, ou déjà réglée) : il est inscrit en doublon, et l'agence doit
     * le rembourser. La part « pénalité » d'un règlement qui a soldé le loyer (`kind: late_fee`)
     * n'en fait pas un règlement à rembourser.
     */
    private function isRefundPending(Model $payment, string $transactionId): bool
    {
        $duplicates = is_array($payment->metadata ?? null) ? ($payment->metadata['gateway_duplicate_payment'] ?? []) : [];

        return collect(is_array($duplicates) ? $duplicates : [])->contains(
            fn ($entry): bool => is_array($entry)
                && ($entry['transaction_id'] ?? null) === $transactionId
                && ($entry['kind'] ?? null) !== 'late_fee',
        );
    }

    protected function resolvePayment(string $type, int $id): Model
    {
        $model = match ($type) {
            'booking-payments' => BookingPayment::query()->findOrFail($id),
            'lease-payments' => LeasePayment::query()->findOrFail($id),
            'invoices' => Invoice::query()->findOrFail($id),
            default => abort_code(404, 'payment.type_unknown'),
        };

        return $model;
    }
}
