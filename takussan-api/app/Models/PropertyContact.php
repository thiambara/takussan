<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TCK-633 (lot C) — un numéro à appeler SUR PLACE (gardien, voisin), titré, non vérifié. Jamais
 * dans `PropertyResource` : il ne sort au public que par `GET /public/properties/{slug}/contact`.
 */
class PropertyContact extends AbstractModel
{
    protected $fillable = ['property_id', 'label', 'phone', 'has_whatsapp', 'position'];

    protected $casts = [
        'has_whatsapp' => 'boolean',
        'position' => 'integer',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }
}
