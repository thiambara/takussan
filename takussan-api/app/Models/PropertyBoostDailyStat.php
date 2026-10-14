<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;

/** TCK-633 lot F (ADR-0061 §10) — impressions et clics d'un boost, par jour (UTC). */
class PropertyBoostDailyStat extends AbstractModel
{
    protected $fillable = ['property_boost_id', 'date', 'impressions', 'clicks'];

    protected $casts = ['date' => 'date', 'impressions' => 'integer', 'clicks' => 'integer'];
}
