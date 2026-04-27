<?php

namespace App\Models\Enums;

enum WatermarkPosition: string
{
    case BottomRight = 'bottom_right';
    case BottomLeft = 'bottom_left';
    case BottomCenter = 'bottom_center';

    public static function default(): self
    {
        return self::BottomRight;
    }

    public function toInterventionPosition(): string
    {
        return match ($this) {
            self::BottomRight => 'bottom-right',
            self::BottomLeft => 'bottom-left',
            self::BottomCenter => 'bottom-center',
        };
    }
}
