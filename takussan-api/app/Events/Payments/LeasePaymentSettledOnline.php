<?php

namespace App\Events\Payments;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * TCK-602 (ADR-0051 §2) — une échéance vient de passer à `paid` par la passerelle (webhook, rejeu
 * ou `verify()`). Émis par `PaymentGatewayService::applyStatusToPayment` à la SEULE transition :
 * une échéance ne produit qu'une quittance. Distribué après la validation de la transaction.
 */
class LeasePaymentSettledOnline implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly int $leasePaymentId) {}
}
