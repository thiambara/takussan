<?php

namespace App\Notifications\Concerns;

use App\Notifications\Channels\SmsChannel;

/**
 * TCK-102 — Marker interface a Notification implements when it can be
 * delivered through SMS. The {@see SmsChannel}
 * channel ignores any Notification that doesn't expose this contract.
 *
 * `toSms()` returns the body to send. `shouldSendSms()` returns true if
 * the notification is currently eligible (e.g. opt-in honored).
 * `isCriticalSms()` is consulted by the router to bypass quiet hours.
 */
interface SupportsSms
{
    public function toSms(object $notifiable): string;

    public function shouldSendSms(): bool;

    public function isCriticalSms(): bool;
}
