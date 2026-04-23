<?php

namespace App\Models;

use App\Services\Notifications\PreferenceResolver;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-070 — Toggle for a (user, event_type, channel) triple.
 *
 * Source of truth consumed by {@see PreferenceResolver}.
 */
class NotificationPreference extends Model
{
    protected $fillable = ['user_id', 'event_type', 'channel', 'enabled'];

    protected $casts = [
        'enabled' => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
