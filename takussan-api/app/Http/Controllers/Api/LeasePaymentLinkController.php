<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Payments\StoreLeasePaymentLinkRequest;
use App\Models\Enums\PaymentLinkSubject;
use App\Models\LeasePayment;
use App\Services\Payments\LeasePaymentLinkService;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-602 (ADR-0051 §1) — le lien de paiement d'une échéance, vu par qui relance : l'émettre (ou
 * relire l'actif), le régénérer, le révoquer. Même autorisation que l'initiation
 * (`LeasePaymentPolicy::update`, TCK-587), sans méthode nouvelle.
 */
class LeasePaymentLinkController extends Controller
{
    public function __construct(
        private readonly LeasePaymentLinkService $links,
        private readonly PaymentGatewayService $gateway,
    ) {}

    public function store(StoreLeasePaymentLinkRequest $request, LeasePayment $payment): JsonResponse
    {
        $this->authorize('update', $payment);
        // Un lien ne s'émet que pour ce qui se paie : une caution rendue, une échéance remboursée
        // ou soldée n'en reçoit pas (la quittance d'une échéance payée part d'elle-même).
        // TCK-2778 — sauf la pénalité de retard restée due sur un loyer payé : un lien pour elle
        // seule (`subject: late_fee`), si l'agence encaisse ses pénalités en ligne.
        $subject = $this->links->subjectFor($payment);
        abort_code_if($subject === null, 409, 'payment.not_payable');
        abort_code_if(
            $subject === PaymentLinkSubject::LateFee && ! $this->gateway->lateFeeAloneCollectibleOnline($payment),
            409,
            'payment.late_fee_not_collected_online',
        );

        $url = $request->boolean('regenerate')
            ? $this->links->regenerate($payment, $request->user(), $subject)
            : $this->links->urlFor($payment, $request->user(), subject: $subject);
        $link = $this->links->active($payment);

        activity('LeasePayment')
            ->causedBy($request->user())
            ->performedOn($payment)
            ->withProperties(['regenerated' => $request->boolean('regenerate'), 'subject' => $subject->value])
            ->event('lease_payment_link_issued')
            ->log('lease_payment_link_issued');

        return $this->json(['data' => [
            'url' => $url,
            'expires_at' => $this->instant($link?->expires_at),
            'subject' => $subject->value,
        ]]);
    }

    public function destroy(Request $request, LeasePayment $payment): JsonResponse
    {
        $this->authorize('update', $payment);
        $revoked = $this->links->revoke($payment);

        if ($revoked) {
            activity('LeasePayment')
                ->causedBy($request->user())
                ->performedOn($payment)
                ->event('lease_payment_link_revoked')
                ->log('lease_payment_link_revoked');
        }

        return $this->json(['data' => ['revoked' => $revoked]]);
    }
}
