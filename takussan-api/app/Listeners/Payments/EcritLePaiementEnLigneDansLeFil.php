<?php

namespace App\Listeners\Payments;

use App\Events\Payments\LeasePaymentSettledOnline;
use App\Models\LeasePayment;
use App\Services\Model\LeasePaymentService;
use Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit;

/**
 * TCK-2961 (ADR-0128 § 3) — un paiement en ligne parle dans la salle du bail : `lease_payment.paid`,
 * puis `lease_payment.receipt_issued` (la quittance que `SendRentReceiptAfterOnlinePayment` sert à
 * cet instant). Les deux écritures du chemin à la main, au même point ({@see LeasePaymentService::parlerDuPaiement()}),
 * dans cet ordre — deux écouteurs distincts n'auraient pas d'ordre garanti.
 *
 * L'événement n'est émis qu'à la SEULE transition vers `paid` : une écriture par paiement.
 */
class EcritLePaiementEnLigneDansLeFil implements ShouldHandleEventsAfterCommit
{
    public function handle(LeasePaymentSettledOnline $event): void
    {
        $payment = LeasePayment::query()->find($event->leasePaymentId);
        if ($payment !== null) {
            LeasePaymentService::parlerDuPaiement($payment);
        }
    }
}
