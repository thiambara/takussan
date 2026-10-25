<?php

namespace App\Listeners\Payments;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Events\Payments\LeasePaymentRefunded;
use App\Models\LeasePayment;
use App\Services\Model\NotificationService;
use App\Services\Notifications\ContactSansCompte;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Support\Facades\Log;

/**
 * TCK-2320 (P39.07, porteur 2026-10-25) — un remboursement du fournisseur avertit le locataire et
 * le bailleur : la quittance déjà partie ne couvre plus la somme rendue. Le locataire est joint
 * comme pour sa quittance ({@see SendRentReceiptAfterOnlinePayment}) : son compte, et le numéro de
 * sa fiche faute de téléphone vérifié ; sans compte, son téléphone. Aucun lien porteur.
 */
class NotifyPartiesOfRentRefund
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function handle(LeasePaymentRefunded $event): void
    {
        $payment = LeasePayment::query()->with(['lease.property', 'lease.tenant.user', 'lease.landlord'])->find($event->leasePaymentId);
        $lease = $payment?->lease;
        if ($payment === null || $lease === null) {
            return;
        }

        $amount = NotificationRenderer::money($event->refundedPart, $payment->currency);
        $property = $lease->property?->title;
        $target = NotificationTarget::of('lease', $lease->id);
        $params = ['amount' => $amount, 'property' => $property];

        $tenant = $lease->tenant;
        if ($tenant?->user) {
            $this->notifications->send($tenant->user, NotificationCode::LeasePaymentRefunded, $params, $target);
            $relais = ContactSansCompte::relaisMobileDuCompte($tenant->user, ContactSansCompte::fromCustomer($tenant));
            if ($relais !== null) {
                $this->notifications->send($relais, NotificationCode::LeasePaymentRefunded, $params, $target);
            }
        } elseif ($tenant !== null && ($contact = ContactSansCompte::fromCustomer($tenant))->hasPhone()) {
            $this->notifications->send($contact, NotificationCode::LeasePaymentRefunded, $params, $target);
        } else {
            Log::info('[refund] avis de remboursement non envoyé — locataire sans compte ni téléphone valide', [
                'lease_payment_id' => $payment->id,
            ]);
        }

        if ($lease->landlord) {
            $this->notifications->send($lease->landlord, NotificationCode::LeasePaymentRefundedLandlord, $params + [
                'tenant' => trim(($tenant?->first_name ?? '').' '.($tenant?->last_name ?? '')),
            ], $target);
        }
    }
}
