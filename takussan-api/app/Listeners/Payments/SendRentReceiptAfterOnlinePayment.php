<?php

namespace App\Listeners\Payments;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Events\Payments\LeasePaymentSettledOnline;
use App\Models\LeasePayment;
use App\Services\Model\NotificationService;
use App\Services\Notifications\ContactSansCompte;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Payments\LeasePaymentLinkService;
use Illuminate\Support\Facades\Log;

/**
 * TCK-602 (ADR-0051 §2) — la quittance d'un paiement en ligne : le locataire, MÊME SANS COMPTE
 * (son téléphone : WhatsApp s'il y a consenti, sinon SMS — ADR-0032 §3), reçoit le lien
 * `/pay/{jeton}` qui sert sa quittance ; le bailleur est prévenu.
 */
class SendRentReceiptAfterOnlinePayment
{
    public function __construct(
        private readonly NotificationService $notifications,
        private readonly LeasePaymentLinkService $links,
    ) {}

    public function handle(LeasePaymentSettledOnline $event): void
    {
        $payment = LeasePayment::query()->with(['lease.property', 'lease.tenant.user', 'lease.landlord'])->find($event->leasePaymentId);
        $lease = $payment?->lease;
        if ($payment === null || $lease === null) {
            return;
        }

        $amount = NotificationRenderer::money($payment->amount, $payment->currency);
        $property = $lease->property?->title;
        $target = NotificationTarget::of('lease', $lease->id);

        $tenant = $lease->tenant;
        $params = ['amount' => $amount, 'property' => $property, 'receipt_url' => $this->links->urlFor($payment)];
        if ($tenant?->user) {
            $this->notifications->send($tenant->user, NotificationCode::LeasePaymentSettledOnline, $params, $target);
        } elseif ($tenant !== null && ($contact = ContactSansCompte::fromCustomer($tenant))->hasPhone()) {
            $this->notifications->send($contact, NotificationCode::LeasePaymentSettledOnline, $params, $target);
        } else {
            Log::info('[pay-link] quittance non envoyée — locataire sans compte ni téléphone valide', [
                'lease_payment_id' => $payment->id,
            ]);
        }

        if ($lease->landlord) {
            $this->notifications->send($lease->landlord, NotificationCode::LeasePaymentReceivedLandlord, [
                'amount' => $amount,
                'property' => $property,
                'tenant' => trim(($tenant?->first_name ?? '').' '.($tenant?->last_name ?? '')),
            ], $target);
        }
    }
}
