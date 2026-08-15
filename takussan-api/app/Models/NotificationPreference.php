<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-070 — Toggle for a (user, event_type, channel) triple.
 *
 * Source of truth consumed by {@see PreferenceResolver}.
 *
 * Étendait `Model` directement, seul écart non justifié sur 70 modèles — il perdait
 * donc `scopeFilter()`, `scopeWithSearch()` et tout le pipeline `buildQuery()` que
 * `AbstractModel` apporte. Un écart sans raison écrite finit par se lire comme un
 * précédent : celui-ci est refermé.
 */
class NotificationPreference extends AbstractModel
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
