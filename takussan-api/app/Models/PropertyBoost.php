<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\BoostBadge;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** TCK-633 lot F (ADR-0061 §5, §8) — un boost acheté ou offert. Écrit par `App\Services\Boost\*` seul. */
class PropertyBoost extends AbstractModel
{
    protected $fillable = [
        'property_id', 'agency_id', 'boost_product_id', 'kind', 'variant', 'price_credits', 'duration_days',
        'starts_at', 'ends_at', 'status', 'remaining_seconds', 'paused_at', 'ended_at', 'offered',
        'offer_reason', 'purchased_by_id', 'cancel_reason', 'cancelled_by_id', 'refunded_credits',
    ];

    protected $casts = [
        'kind' => BoostKind::class,
        'variant' => BoostBadge::class,
        'status' => BoostStatus::class,
        'price_credits' => 'integer',
        'duration_days' => 'integer',
        'remaining_seconds' => 'integer',
        'refunded_credits' => 'integer',
        'offered' => 'boolean',
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'paused_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class)->withTrashed();
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(BoostProduct::class, 'boost_product_id');
    }

    public function dailyStats(): HasMany
    {
        return $this->hasMany(PropertyBoostDailyStat::class);
    }
}
