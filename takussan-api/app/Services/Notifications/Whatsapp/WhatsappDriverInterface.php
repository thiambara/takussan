<?php

namespace App\Services\Notifications\Whatsapp;

/**
 * TCK-282 — Contract implemented by every WhatsApp driver
 * (CloudApi, Log). Mono-provider: there is no router layer (unlike SMS),
 * the {@see WhatsappChannel} talks to the bound driver directly.
 */
interface WhatsappDriverInterface
{
    /**
     * Dispatch one or more WhatsApp messages.
     *
     * @param  array<int,string>|string  $to  one or more E.164 phone numbers
     * @param  array<string,mixed>  $context  optional metadata
     *                                        - `agency_id`  int  agency whose Integration to consume
     * @return array<string,WhatsappResult> map keyed by recipient E.164
     */
    public function send(array|string $to, WhatsappMessage $message, array $context = []): array;

    /**
     * Stable identifier — used in logs and
     * `notification_delivery_attempts.provider`.
     */
    public function id(): string;
}
