<?php

namespace App\Services\Boost;

use App\Models\AgencySpotlight;

/** TCK-2525 — la place d'un achat, et s'il a été rejoué par sa clé d'idempotence plutôt qu'écrit. */
final readonly class SpotlightPurchaseResult
{
    public function __construct(
        public AgencySpotlight $spotlight,
        public bool $replayed,
    ) {}
}
