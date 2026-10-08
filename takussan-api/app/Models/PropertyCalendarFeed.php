<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * TCK-596 §3B (ADR-0041) — un flux iCal externe importé pour un bien.
 *
 * `url` est chiffrée en base et cachée de toute sérialisation : elle porte souvent un secret de la
 * plateforme tierce. Seul `url_host` ressort de l'API.
 */
class PropertyCalendarFeed extends AbstractModel
{
    /** Enregistré, pas encore synchronisé : la première synchronisation est une tâche de file (VERIF-596 m3). */
    public const STATUS_PENDING = 'pending';

    public const STATUS_OK = 'ok';

    public const STATUS_FAILED = 'failed';

    /** Au troisième échec consécutif, le bailleur est prévenu (une fois). */
    public const FAILURES_BEFORE_ALERT = 3;

    protected $fillable = [
        'property_id', 'url', 'url_host', 'label', 'created_by_id',
        'last_synced_at', 'last_status', 'last_error', 'failing_since', 'consecutive_failures',
    ];

    protected $hidden = ['url'];

    protected $casts = [
        'url' => 'encrypted',
        'last_synced_at' => 'datetime',
        'failing_since' => 'datetime',
        'consecutive_failures' => 'integer',
    ];

    protected static array $queryFields = [
        'id', 'property_id', 'url_host', 'label', 'last_synced_at', 'last_status',
        'last_error', 'failing_since', 'consecutive_failures', 'created_at',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function unavailabilities(): HasMany
    {
        return $this->hasMany(PropertyUnavailability::class, 'calendar_feed_id');
    }
}
