<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-2905 (ADR-0117) — les vues d'un bien un jour donné : un nombre, sans visiteur. Écrite par le seul
 * `PropertyViewCounter::record()` ; jamais exposée telle quelle (la liste agence en rend la somme sur
 * 30 jours, `stats_30d.views`).
 */
class PropertyDailyView extends AbstractModel
{
    protected $fillable = ['property_id', 'day', 'views'];

    protected $casts = ['day' => 'date', 'views' => 'integer'];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }
}
