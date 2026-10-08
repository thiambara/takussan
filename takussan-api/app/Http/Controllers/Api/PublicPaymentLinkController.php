<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Payments\InitiatePublicPaymentLinkRequest;
use App\Models\Enums\PaymentProvider;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Services\Payments\LeasePaymentLinkService;
use App\Services\Payments\PaymentGatewayService;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-602 (ADR-0051 §1) — la page publique d'un lien de paiement, `/pay/{jeton}`, pour un
 * locataire SANS COMPTE : lire le montant de SON échéance, la payer, relire sa quittance.
 *
 * Le contrôleur ne calcule rien : le montant est `PaymentGatewayService::amountDue()`, les
 * fournisseurs `availableProviders()`, l'initiation `initiate()` (qui refuse une échéance soldée,
 * 409). Il ne révèle ni le nom ni le téléphone du locataire, ni l'adresse complète du bien, ni un
 * identifiant interne : la référence de l'échéance est le seul identifiant.
 */
class PublicPaymentLinkController extends Controller
{
    public function __construct(
        private readonly LeasePaymentLinkService $links,
        private readonly PaymentGatewayService $gateway,
    ) {}

    public function show(string $token): JsonResponse
    {
        $link = $this->links->resolve($token);
        $this->links->touch($link);

        return $this->json(['data' => $this->present($link->leasePayment, $this->links->effectiveExpiry($link, $link->leasePayment)->toIso8601String())]);
    }

    public function initiate(InitiatePublicPaymentLinkRequest $request, string $token): JsonResponse
    {
        $payment = $this->links->resolve($token)->leasePayment;
        $provider = PaymentProvider::from((string) $request->validated('provider'));

        // Les URLs de retour sont celles de la page du lien, jamais celles de la requête.
        $session = $this->gateway->initiate($payment, $provider, [
            'return_url' => $this->links->returnUrl($token, 'success'),
            'cancel_url' => $this->links->returnUrl($token, 'cancelled'),
        ]);

        return $this->json(['data' => ['checkout_url' => $session->checkoutUrl, 'provider' => $session->provider]]);
    }

    public function verify(string $token): JsonResponse
    {
        $payment = $this->links->resolve($token)->leasePayment;
        $this->gateway->verify($payment);
        $payment->refresh();

        return $this->json(['data' => [
            'status' => $payment->status?->value,
            'amount_due' => (float) ($this->gateway->amountDue($payment) ?? 0),
            'receipt_available' => $this->receiptAvailable($payment),
        ]]);
    }

    public function receipt(string $token, DocumentPdfService $pdf): Response
    {
        $payment = $this->links->resolve($token)->leasePayment;
        abort_code_unless($this->receiptAvailable($payment), 409, 'pay_link.receipt_unavailable');

        return DocumentPdfController::streamRentReceipt($pdf, $payment->lease, $payment);
    }

    private function receiptAvailable(LeasePayment $payment): bool
    {
        return $payment->status === PaymentStatus::Paid;
    }

    /** @return array<string, mixed> */
    private function present(LeasePayment $payment, string $expiresAt): array
    {
        $lease = $payment->lease;
        $property = $lease?->property;

        return [
            'reference' => $payment->reference_number,
            'status' => $payment->status?->value,
            'currency' => $payment->currency?->value,
            // Les trois valeurs de `LeasePaymentResource` (TCK-593), lues aux mêmes sources.
            'amount_due' => (float) ($this->gateway->amountDue($payment) ?? 0),
            'late_fee_outstanding' => $payment->lateFeeOutstanding(),
            'late_fee_payable_online' => $this->gateway->lateFeeIncluded($payment),
            'period_start' => $payment->period_start?->toDateString(),
            'period_end' => $payment->period_end?->toDateString(),
            'due_date' => $payment->due_date?->toDateString(),
            'property' => [
                'title' => $property?->title,
                'neighborhood' => $property?->address?->neighborhood,
            ],
            'agency' => ['name' => $lease?->agency?->name],
            'providers' => $this->gateway->isPayable($payment)
                ? array_map(fn (PaymentProvider $p) => $p->value, $this->gateway->availableProviders($payment))
                : [],
            'receipt_available' => $this->receiptAvailable($payment),
            'expires_at' => $expiresAt,
        ];
    }
}
