<?php

namespace App\Services\Payments\Dto;

/**
 * Normalised webhook event extracted from a provider's payload.
 */
final class PaymentEvent
{
    public const TYPE_PAID = 'paid';

    public const TYPE_PENDING = 'pending';

    public const TYPE_FAILED = 'failed';

    public const TYPE_REFUNDED = 'refunded';

    /**
     * @param  array<string,mixed>  $metadata
     */
    public function __construct(
        public readonly string $provider,
        public readonly string $type,
        public readonly string $transactionId,
        public readonly array $metadata = [],
    ) {}
}
