<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\BoostBadge;
use App\Models\Enums\BoostKind;

/** TCK-633 lot F (ADR-0061 §4) — une offre du catalogue. Prix et durée se FIGENT dans le boost acheté. */
class BoostProduct extends AbstractModel
{
    protected $fillable = ['kind', 'variant', 'duration_days', 'price_credits', 'is_active', 'sort_order'];

    protected $casts = [
        'kind' => BoostKind::class,
        'variant' => BoostBadge::class,
        'duration_days' => 'integer',
        'price_credits' => 'integer',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];
}
