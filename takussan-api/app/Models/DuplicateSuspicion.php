<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-597 (ADR-0054 §5) — deux biens de publieurs différents soupçonnés d'être la même annonce.
 */
class DuplicateSuspicion extends AbstractModel
{
    public const SIGNAL_PHOTO = 'photo';

    public const SIGNAL_ADDRESS = 'address';

    protected $fillable = [
        'property_id', 'matched_property_id', 'signal', 'distance',
        'decision', 'resolved_by_id', 'reason_code', 'resolved_at',
    ];

    protected $casts = [
        'distance' => 'integer',
        'resolved_at' => 'datetime',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function matchedProperty(): BelongsTo
    {
        return $this->belongsTo(Property::class, 'matched_property_id');
    }

    public function resolvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by_id');
    }
}
