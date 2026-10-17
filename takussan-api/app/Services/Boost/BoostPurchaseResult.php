<?php

namespace App\Services\Boost;

use App\Models\PropertyBoost;

/** TCK-822 (P24.01) — le boost d'un achat, et s'il a été rejoué par sa clé d'idempotence plutôt qu'écrit. */
final readonly class BoostPurchaseResult
{
    public function __construct(
        public PropertyBoost $boost,
        public bool $replayed,
    ) {}
}
