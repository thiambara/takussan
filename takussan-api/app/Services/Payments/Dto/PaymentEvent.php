<?php

namespace App\Services\Payments\Dto;

/**
 * Normalised webhook event extracted from a provider's payload.
 *
 * TCK-293 (ADR-0046 §5) — `authority` dit qui a authentifié l'événement. Les pilotes le
 * construisent sans ; `PaymentGatewayService` l'attache par `authenticatedBy()` après la
 * signature. Un événement sans autorité ne rapproche rien.
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
        public readonly ?WebhookAuthority $authority = null,
    ) {}

    public function authenticatedBy(WebhookAuthority $authority): self
    {
        return new self($this->provider, $this->type, $this->transactionId, $this->metadata, $authority);
    }
}
