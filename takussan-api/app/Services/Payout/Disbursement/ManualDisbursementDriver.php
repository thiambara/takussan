<?php

namespace App\Services\Payout\Disbursement;

use App\Contracts\Payments\DisbursementDriverContract;
use App\Models\Payout;
use App\Models\PayoutMethod;

/**
 * TCK-594 (ADR-0039 §1) — le décaissement manuel tracé : aucun appel à un tiers. L'humain a déjà
 * payé ; ce pilote consigne la référence qu'il a saisie et la destination MASQUÉE vers laquelle il
 * a payé.
 */
final class ManualDisbursementDriver implements DisbursementDriverContract
{
    public function disburse(Payout $payout, ?PayoutMethod $destination, ?string $reference): array
    {
        return array_filter([
            'disbursement_driver' => $this->name(),
            'destination_kind' => $destination?->kind?->value,
            'destination_masked' => $destination?->masked_identifier,
            'destination_id' => $destination?->id,
        ], fn ($value) => $value !== null);
    }

    public function name(): string
    {
        return 'manual';
    }
}
