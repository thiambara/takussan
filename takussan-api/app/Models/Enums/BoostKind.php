<?php

namespace App\Models\Enums;

/** TCK-633 lot F (ADR-0061 §5) — Remontée, Vedette, Badge. */
enum BoostKind: string
{
    case Bump = 'bump';
    case Featured = 'featured';
    case Badge = 'badge';
}
