<?php

namespace App\Events\Payments;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * TCK-2320 (P39.07) — le fournisseur a remboursé, en tout ou en partie, une échéance encaissée en
 * ligne. Émis par `PaymentGatewayService::applyStatusToPayment` pour la part NEUVE du remboursement
 * (un événement rejoué n'en a pas). Distribué après la validation de la transaction.
 */
class LeasePaymentRefunded implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * @param  bool  $lateFeeAlone  TCK-2793 — le remboursement porte sur la pénalité payée SEULE
     *                              (`LateFeeAloneCheckout`), et non sur le loyer : l'avis le dit.
     */
    public function __construct(
        public readonly int $leasePaymentId,
        public readonly float $refundedPart,
        public readonly bool $lateFeeAlone = false,
    ) {}
}
