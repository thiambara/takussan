<?php

namespace App\Services\Media;

use App\Models\Agency;
use App\Models\Enums\WatermarkPosition;

class AgencyWatermarkContext
{
    public function __construct(
        public readonly string $agencyName,
        public readonly string $agencyUrl,
        public readonly ?string $logoPath,
        public readonly WatermarkPosition $position,
        public readonly int $opacity,
    ) {}

    public static function defaults(): array
    {
        return [
            'watermark_enabled' => true,
            'watermark_position' => WatermarkPosition::default()->value,
            'watermark_opacity' => 60,
        ];
    }

    public static function fromAgency(Agency $agency): self
    {
        $settings = $agency->settings ?? [];
        $defaults = self::defaults();

        return new self(
            agencyName: $agency->name ?? '',
            agencyUrl: $agency->website ?? '',
            logoPath: $agency->getFirstMediaPath('logo') ?: null,
            position: WatermarkPosition::tryFrom((string) ($settings['watermark_position'] ?? $defaults['watermark_position']))
                ?? WatermarkPosition::default(),
            opacity: (int) ($settings['watermark_opacity'] ?? $defaults['watermark_opacity']),
        );
    }
}
