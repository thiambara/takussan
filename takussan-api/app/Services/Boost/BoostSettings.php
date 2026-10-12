<?php

namespace App\Services\Boost;

use App\Services\Admin\PlatformSettingService;

/** TCK-633 lot F (ADR-0061 §6) — le seul lecteur des six réglages du crédit et du boost. */
final class BoostSettings
{
    public function __construct(private readonly PlatformSettingService $settings) {}

    public function welcomeAmount(): int
    {
        return (int) $this->settings->getValue('credits.welcome_amount');
    }

    public function welcomeValidityDays(): int
    {
        return (int) $this->settings->getValue('credits.welcome_validity_days');
    }

    public function expiryNoticeDays(): int
    {
        return (int) $this->settings->getValue('credits.expiry_notice_days');
    }

    public function bumpCooldownHours(): int
    {
        return (int) $this->settings->getValue('boost.bump_cooldown_hours');
    }

    public function sponsoredSlotsPerPage(): int
    {
        return (int) $this->settings->getValue('boost.sponsored_slots_per_page');
    }

    public function reservedTopResults(): int
    {
        return (int) $this->settings->getValue('boost.reserved_top_results');
    }
}
