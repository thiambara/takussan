<?php

namespace App\Services\Notifications\Sms;

/**
 * TCK-102 — Outcome of a single (provider, recipient) attempt.
 *
 * `deferred_to_fallback` is distinct from `failed`: it signals a quota
 * or quiet-hours bypass — the provider was not actually broken, so it
 * must not pollute provider-level error metrics.
 */
class SmsResult
{
    public const STATUS_SENT = 'sent';

    public const STATUS_FAILED = 'failed';

    public const STATUS_DEFERRED_TO_FALLBACK = 'deferred_to_fallback';

    public const STATUS_DELIVERED = 'delivered';

    public function __construct(
        public readonly string $to,
        public readonly string $provider,
        public readonly string $status,
        public readonly ?string $providerMessageId = null,
        public readonly ?string $failureReason = null,
        public readonly ?float $costEstimate = null,
        public readonly ?int $segmentsCount = null,
        public readonly ?\DateTimeImmutable $sentAt = null,
        public readonly ?\DateTimeImmutable $deliveredAt = null,
    ) {}

    public static function sent(
        string $to,
        string $provider,
        string $providerMessageId,
        ?int $segmentsCount = null,
        ?float $costEstimate = null,
    ): self {
        return new self(
            to: $to,
            provider: $provider,
            status: self::STATUS_SENT,
            providerMessageId: $providerMessageId,
            segmentsCount: $segmentsCount,
            costEstimate: $costEstimate,
            sentAt: new \DateTimeImmutable,
        );
    }

    public static function failed(string $to, string $provider, string $reason): self
    {
        return new self(
            to: $to,
            provider: $provider,
            status: self::STATUS_FAILED,
            failureReason: $reason,
            sentAt: new \DateTimeImmutable,
        );
    }

    public static function deferred(string $to, string $provider, string $reason): self
    {
        return new self(
            to: $to,
            provider: $provider,
            status: self::STATUS_DEFERRED_TO_FALLBACK,
            failureReason: $reason,
            sentAt: new \DateTimeImmutable,
        );
    }

    /**
     * @return array<string,mixed>
     */
    public function toAttempt(int $attempt): array
    {
        $entry = [
            'attempt' => $attempt,
            'provider' => $this->provider,
            'to' => $this->to,
            'status' => $this->status,
            'provider_message_id' => $this->providerMessageId,
            'failure_reason' => $this->failureReason,
            'cost_estimate' => $this->costEstimate,
            'segments_count' => $this->segmentsCount,
            'sent_at' => $this->sentAt?->format(DATE_ATOM),
        ];
        if ($this->deliveredAt) {
            $entry['delivered_at'] = $this->deliveredAt->format(DATE_ATOM);
        }

        return $entry;
    }

    public function isTerminalSuccess(): bool
    {
        return $this->status === self::STATUS_SENT;
    }

    public function shouldFallback(): bool
    {
        return $this->status === self::STATUS_FAILED
            || $this->status === self::STATUS_DEFERRED_TO_FALLBACK;
    }
}
