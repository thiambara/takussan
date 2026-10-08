<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-596 §3B (ADR-0041) — une plage `[starts_on, ends_on)` où le bien n'est pas réservable.
 * `ends_on` est exclusif, comme le jour de départ d'une réservation.
 */
class PropertyUnavailability extends AbstractModel
{
    public const SOURCE_MANUAL = 'manual';

    public const SOURCE_ICAL = 'ical';

    protected $fillable = [
        'property_id', 'starts_on', 'ends_on', 'reason', 'source',
        'calendar_feed_id', 'external_uid', 'conflict_booking_id', 'created_by_id',
    ];

    protected $casts = [
        'starts_on' => 'date',
        'ends_on' => 'date',
    ];

    protected static array $queryFields = [
        'id', 'property_id', 'starts_on', 'ends_on', 'reason', 'source',
        'calendar_feed_id', 'conflict_booking_id', 'created_at',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function feed(): BelongsTo
    {
        return $this->belongsTo(PropertyCalendarFeed::class, 'calendar_feed_id');
    }

    public function conflictBooking(): BelongsTo
    {
        return $this->belongsTo(Booking::class, 'conflict_booking_id');
    }

    public function isImported(): bool
    {
        return $this->source === self::SOURCE_ICAL;
    }
}
