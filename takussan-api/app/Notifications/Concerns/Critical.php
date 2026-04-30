<?php

namespace App\Notifications\Concerns;

/**
 * TCK-102 — Tag a Notification as a critical SMS.
 *
 * Mark a Notification class with this trait when its delivery via SMS
 * must bypass the user's opt-in preferences AND the ARTP quiet-hours
 * window (e.g. 2FA codes, password reset codes, security alerts).
 *
 * Notifications that simply support SMS without being critical should
 * implement {@see SupportsSms} and return `false` from
 * `isCriticalSms()` (the default).
 */
trait Critical
{
    public function shouldSendSms(): bool
    {
        return true;
    }

    public function isCriticalSms(): bool
    {
        return true;
    }
}
