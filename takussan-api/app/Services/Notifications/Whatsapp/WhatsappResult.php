<?php

namespace App\Services\Notifications\Whatsapp;

use App\Services\Notifications\Sms\SmsResult;

/**
 * TCK-282 — Outcome of a single (provider, recipient) WhatsApp attempt.
 * Mirror of {@see SmsResult}.
 *
 * `deferred_to_fallback` signals "WhatsApp was not eligible / not actually
 * broken, hand off to SMS" (contact opted-out, out-of-window without an
 * approved template). `failed` is a genuine provider/transport error. Both
 * trigger the cross-channel SMS fallback ({@see shouldFallback()}).
 */
class WhatsappResult
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
        public readonly ?\DateTimeImmutable $sentAt = null,
        public readonly ?\DateTimeImmutable $deliveredAt = null,
    ) {}

    public static function sent(string $to, string $provider, string $providerMessageId): self
    {
        return new self(
            to: $to,
            provider: $provider,
            status: self::STATUS_SENT,
            providerMessageId: $providerMessageId,
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
