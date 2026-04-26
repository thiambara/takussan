<?php

namespace App\Services\Notifications\Sms;

use Carbon\CarbonImmutable;
use Illuminate\Contracts\Config\Repository as ConfigRepository;

/**
 * TCK-102 — ARTP quiet-hours gate (Africa/Dakar 22h–06h).
 *
 * Critical SMS (2FA, OTP, security alerts) bypass the gate; everything
 * else dispatched inside the window is deferred until 06h00 by the
 * router. The window may wrap past midnight: 22 ≤ now < 24 OR 0 ≤ now < 6.
 */
class QuietHoursGuard
{
    public function __construct(private readonly ConfigRepository $config) {}

    public function isQuietNow(?CarbonImmutable $now = null): bool
    {
        if (! $this->config->get('sms.quiet_hours.enabled', true)) {
            return false;
        }

        $tz = $this->config->get('sms.quiet_hours.timezone', 'Africa/Dakar');
        $startHour = (int) $this->config->get('sms.quiet_hours.start_hour', 22);
        $endHour = (int) $this->config->get('sms.quiet_hours.end_hour', 6);

        $now = ($now ?? CarbonImmutable::now())->setTimezone($tz);
        $hour = (int) $now->format('G');

        if ($startHour < $endHour) {
            return $hour >= $startHour && $hour < $endHour;
        }

        // Wrapping window (default case): 22h–06h.
        return $hour >= $startHour || $hour < $endHour;
    }

    /**
     * Compute the next 06h00 in the configured TZ — used by the router
     * to schedule a deferred queue dispatch.
     */
    public function nextWindowEnd(?CarbonImmutable $now = null): CarbonImmutable
    {
        $tz = $this->config->get('sms.quiet_hours.timezone', 'Africa/Dakar');
        $endHour = (int) $this->config->get('sms.quiet_hours.end_hour', 6);

        $now = ($now ?? CarbonImmutable::now())->setTimezone($tz);
        $candidate = $now->setTime($endHour, 0, 0);
        if ($candidate->lessThanOrEqualTo($now)) {
            $candidate = $candidate->addDay();
        }

        return $candidate;
    }

    public function shouldDefer(bool $isCritical, ?CarbonImmutable $now = null): bool
    {
        if ($isCritical) {
            return false;
        }

        return $this->isQuietNow($now);
    }
}
