<?php

namespace App\Services\Payments\Dto;

/**
 * Provider-side status snapshot returned by `verify()`. We deliberately
 * keep this distinct from `App\Models\Enums\PaymentStatus` — drivers
 * report their own vocabulary (e.g. `succeeded`, `pending`, `failed`)
 * and the orchestrator translates to our domain enum.
 */
final class PaymentStatus
{
    public const SUCCESS = 'success';

    public const PENDING = 'pending';

    public const FAILED = 'failed';

    public const REFUNDED = 'refunded';

    /**
     * @param  array<string,mixed>  $rawPayload
     */
    public function __construct(
        public readonly string $status,
        public readonly string $transactionId,
        public readonly array $rawPayload = [],
    ) {}
}
