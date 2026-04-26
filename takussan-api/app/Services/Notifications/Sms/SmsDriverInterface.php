<?php

namespace App\Services\Notifications\Sms;

/**
 * TCK-102 — Common contract implemented by every SMS leaf driver
 * (Orange, Mtarget, LAfricaMobile, Log) and by the orchestrator
 * SmsRouterDriver. The router groups by operator, the leaves know
 * how to talk to a single provider; both expose the same `send()`.
 */
interface SmsDriverInterface
{
    /**
     * Dispatch one or more SMS.
     *
     * @param  array<int,string>|string  $to  one or more E.164 phone numbers
     * @param  string  $message  the message body (UTF-8)
     * @param  array<string,mixed>  $context  optional metadata
     *                                        - `event_type`   string  PreferenceResolver event id
     *                                        - `is_critical`  bool    bypass quiet hours / preference gates
     *                                        - `agency_id`    int     agency whose Integration to consume
     *                                        - `notification_id` int  AppNotification.id to log delivery_attempts
     *                                        - `sender_id`    string  override default Integration sender
     * @return array<string,SmsResult> map keyed by recipient E.164
     */
    public function send(array|string $to, string $message, array $context = []): array;

    /**
     * Stable identifier — used in logs, delivery_attempts.provider and
     * Integration.provider lookup (`sms_{id()}`).
     */
    public function id(): string;
}
