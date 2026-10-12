<?php

namespace App\Models\Enums;

/** TCK-633 lot F (ADR-0061 §5, §8). */
enum BoostStatus: string
{
    case Active = 'active';
    case Paused = 'paused';
    case Ended = 'ended';
    case Cancelled = 'cancelled';
    case Refunded = 'refunded';

    /** @return list<self> les statuts d'un boost qui occupe encore le bien */
    public static function live(): array
    {
        return [self::Active, self::Paused];
    }
}
