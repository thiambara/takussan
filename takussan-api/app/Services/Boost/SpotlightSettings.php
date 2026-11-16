<?php

namespace App\Services\Boost;

use App\Services\Admin\PlatformSettingService;

/**
 * TCK-2525 (amendement du 2026-11-16 d'ADR-0061) — le seul lecteur des réglages de la place « Mise en
 * avant » vendue en crédits. Tous réglables par le super-admin ; les défauts sont ceux du catalogue
 * (`EditablePlatformSettings`), justifiés dans l'amendement.
 */
final class SpotlightSettings
{
    public function __construct(private readonly PlatformSettingService $settings) {}

    public function saleEnabled(): bool
    {
        return filter_var($this->settings->getValue('spotlight.sale_enabled'), FILTER_VALIDATE_BOOL);
    }

    public function priceCredits(): int
    {
        return (int) $this->settings->getValue('spotlight.price_credits');
    }

    public function durationDays(): int
    {
        return (int) $this->settings->getValue('spotlight.duration_days');
    }

    public function maxAdvanceDays(): int
    {
        return (int) $this->settings->getValue('spotlight.max_advance_days');
    }

    /** `refuse` | `next_free`. */
    public function whenTaken(): string
    {
        return (string) $this->settings->getValue('spotlight.when_taken');
    }

    /** `prorata` | `full` | `none`. */
    public function refundOnSuspension(): string
    {
        return (string) $this->settings->getValue('spotlight.refund_on_suspension');
    }

    /** `blocks` | `yields`. */
    public function offeredOverlap(): string
    {
        return (string) $this->settings->getValue('spotlight.offered_overlap');
    }

    public function sellDirectoryWide(): bool
    {
        return filter_var($this->settings->getValue('spotlight.sell_directory_wide'), FILTER_VALIDATE_BOOL);
    }

    /** @return array<string, mixed> la forme que l'écran d'achat lit. */
    public function toArray(): array
    {
        return [
            'sale_enabled' => $this->saleEnabled(),
            'price_credits' => $this->priceCredits(),
            'duration_days' => $this->durationDays(),
            'max_advance_days' => $this->maxAdvanceDays(),
            'when_taken' => $this->whenTaken(),
            'sell_directory_wide' => $this->sellDirectoryWide(),
        ];
    }
}
