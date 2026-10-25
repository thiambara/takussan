<?php

namespace App\Events\Payments;

use App\Services\Billing\PlatformPayoutRefundSignal;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * TCK-2320 (P39.07) — une ligne d'un reversement de la plateforme déjà `paid` vient d'être
 * remboursée ({@see PlatformPayoutRefundSignal}). Distribué après la
 * validation de la transaction du remboursement.
 */
class PlatformPayoutLineRefunded implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly int $platformPayoutId,
        public readonly string $reference,
    ) {}
}
