<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\Currency;
use App\Models\Enums\PriceChangeReason;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PropertyPriceHistory extends AbstractModel
{
    use HasFactory;

    public $timestamps = false;

    protected $fillable = [
        'property_id', 'changed_by_id',
        'old_price', 'new_price', 'currency',
        'reason', 'notes', 'changed_at', 'created_at',
    ];

    protected $casts = [
        'currency' => Currency::class,
        'reason' => PriceChangeReason::class,
        'old_price' => 'decimal:2',
        'new_price' => 'decimal:2',
        'changed_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function changedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by_id');
    }
}
