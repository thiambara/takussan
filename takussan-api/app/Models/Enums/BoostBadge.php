<?php

namespace App\Models\Enums;

/** TCK-633 lot F (ADR-0061 §5) — un seul badge actif par bien. */
enum BoostBadge: string
{
    case Urgent = 'urgent';
    case PriceDrop = 'price_drop';
}
