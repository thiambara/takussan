<?php

namespace App\Services\Payments\Dto;

/**
 * Plain DTO carrying the result of `PaymentDriverContract::initiate()`.
 *
 * @phpstan-type RawProviderPayload array<string,mixed>
 */
final class CheckoutSession
{
    /**
     * @param  array<string,mixed>  $rawPayload
     */
    public function __construct(
        public readonly string $checkoutUrl,
        public readonly string $transactionId,
        public readonly string $provider,
        public readonly array $rawPayload = [],
    ) {}
}
