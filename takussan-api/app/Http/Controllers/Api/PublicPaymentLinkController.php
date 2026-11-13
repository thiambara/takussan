<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Payments\InitiatePublicPaymentLinkRequest;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentLinkSubject;
use App\Models\Enums\PaymentProvider;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\LeasePaymentLink;
use App\Services\Payments\LeasePaymentLinkService;
use App\Services\Payments\OfflinePaymentMeans;
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
 *
 * TCK-2778 — un lien `subject: late_fee` fait payer la pénalité de retard SEULE, restée due sur un
 * loyer payé : son montant, ses fournisseurs, son initiation et sa vérification sont ceux de la
 * pénalité (`PaymentGatewayService::lateFeeAlone*`), jamais ceux du loyer. Une fois la pénalité
 * réglée (en ligne ou à l'agence), le lien ne propose plus rien à payer : `amount_due` 0, aucun
 * fournisseur.
 */
class PublicPaymentLinkController extends Controller
{
    public function __construct(
        private readonly LeasePaymentLinkService $links,
        private readonly PaymentGatewayService $gateway,
    ) {}

    public function show(string $token): JsonResponse
    {
        // TCK-2504 — une échéance remboursée se LIT (état et `paid_at`) ; elle ne se paie pas.
        $link = $this->links->resolve($token, readSettled: true);
        $this->links->touch($link);

        return $this->json(['data' => $this->present($link, $this->instant($this->links->effectiveExpiry($link, $link->leasePayment)))]);
    }

    public function initiate(InitiatePublicPaymentLinkRequest $request, string $token): JsonResponse
    {
        $link = $this->links->resolve($token);
        $payment = $link->leasePayment;
        $provider = PaymentProvider::from((string) $request->validated('provider'));

        // Les URLs de retour sont celles de la page du lien, jamais celles de la requête.
        $returns = [
            'return_url' => $this->links->returnUrl($token, 'success'),
            'cancel_url' => $this->links->returnUrl($token, 'cancelled'),
        ];
        $session = $link->isForLateFee()
            ? $this->gateway->initiateLateFeeAlone($payment, $provider, $returns)
            : $this->gateway->initiate($payment, $provider, $returns);

        return $this->json(['data' => ['checkout_url' => $session->checkoutUrl, 'provider' => $session->provider]]);
    }

    public function verify(string $token): JsonResponse
    {
        $link = $this->links->resolve($token);
        $payment = $link->leasePayment;
        $link->isForLateFee() ? $this->gateway->verifyLateFeeAlone($payment) : $this->gateway->verify($payment);
        $payment->refresh();

        return $this->json(['data' => [
            'status' => $payment->status?->value,
            'subject' => $this->subject($link),
            'amount_due' => $this->amountDue($link, $payment),
            // TCK-2778 — l'issue d'un lien de pénalité se lit ici : `status` décrit le loyer.
            'late_fee_paid_at' => $this->instant($payment->late_fee_paid_at),
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

    /** TCK-2778 — ce que le lien fait payer (`rent` pour un lien antérieur à la colonne). */
    private function subject(LeasePaymentLink $link): string
    {
        return ($link->subject ?? PaymentLinkSubject::Rent)->value;
    }

    /** TCK-2778 — ce que la page demande : la pénalité seule pour un lien `late_fee`, sinon `amountDue()`. */
    private function amountDue(LeasePaymentLink $link, LeasePayment $payment): float
    {
        return $link->isForLateFee()
            ? $this->gateway->lateFeeAloneDue($payment)
            : (float) ($this->gateway->amountDue($payment) ?? 0);
    }

    /** @return array<string, mixed> */
    private function present(LeasePaymentLink $link, string $expiresAt): array
    {
        $payment = $link->leasePayment;
        $lease = $payment->lease;
        $forLateFee = $link->isForLateFee();
        $property = $lease?->property;

        return [
            'reference' => $payment->reference_number,
            'status' => $payment->status?->value,
            // TCK-2778 — `late_fee` : la page fait payer la pénalité de retard seule, pas le loyer.
            'subject' => $this->subject($link),
            'currency' => $payment->currency?->value,
            // Les trois valeurs de `LeasePaymentResource` (TCK-593), lues aux mêmes sources.
            'amount_due' => $this->amountDue($link, $payment),
            'late_fee_outstanding' => $payment->lateFeeOutstanding(),
            'late_fee_payable_online' => $forLateFee
                ? $this->gateway->lateFeeAloneCollectibleOnline($payment)
                : $this->gateway->lateFeeIncluded($payment),
            'late_fee_paid_at' => $this->instant($payment->late_fee_paid_at),
            'period_start' => $payment->period_start?->toDateString(),
            'period_end' => $payment->period_end?->toDateString(),
            'due_date' => $payment->due_date?->toDateString(),
            'property' => [
                'title' => $property?->title,
                'neighborhood' => $property?->address?->neighborhood,
            ],
            'agency' => ['name' => $lease?->agency?->name],
            'providers' => array_map(fn (PaymentProvider $p) => $p->value, match (true) {
                $forLateFee => $this->gateway->lateFeeAloneProviders($payment),
                $this->gateway->isPayable($payment) => $this->gateway->availableProviders($payment),
                default => [],
            }),
            'receipt_available' => $this->receiptAvailable($payment),
            // TCK-2504 — l'échéance réglée (ou remboursée) le dit : sa date, au lieu d'une erreur.
            'paid_at' => $this->instant($payment->paid_at),
            'offline_payment' => $this->offlinePayment($payment),
            'expires_at' => $expiresAt,
        ];
    }

    /**
     * TCK-2504 — comment payer HORS LIGNE : les moyens que l'agence déclare (`AgencySettings`) et
     * son téléphone. Les champs nuls sont omis ; rien de déclaré → `null`. Une échéance qui ne se
     * paie plus (réglée, remboursée) n'invite à aucun paiement : `null`.
     *
     * L'agence n'a aucun numéro WhatsApp déclaré (ni colonne ni réglage, relevé 2026-11-09) :
     * `agency_whatsapp` du contrat n'a pas de source et n'est jamais rendu.
     *
     * @return array<string, string>|null
     */
    private function offlinePayment(LeasePayment $payment): ?array
    {
        // TCK-2649 — la lecture des moyens est partagée avec `GET /api/me/rent-summary`.
        return $this->owesSomething($payment) ? OfflinePaymentMeans::of($payment->lease?->agency) : null;
    }

    /**
     * TCK-2504 (revue) — le locataire doit-il encore quelque chose à l'agence ? Le loyer
     * (`amount_due` > 0) OU la pénalité (`late_fee_outstanding` > 0 : un loyer payé dont la pénalité
     * reste due se règle hors ligne, à l'agence). Jamais une échéance remboursée ou annulée, ni une
     * caution rendue : rien n'y est dû.
     */
    private function owesSomething(LeasePayment $payment): bool
    {
        if ($payment->payment_type === LeasePaymentType::DepositRefund
            || in_array($payment->status, [PaymentStatus::Refunded, PaymentStatus::Cancelled], true)) {
            return false;
        }

        return (float) ($this->gateway->amountDue($payment) ?? 0) > 0 || $payment->lateFeeOutstanding() > 0;
    }
}
