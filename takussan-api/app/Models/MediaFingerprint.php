<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-597 (ADR-0054) — l'empreinte dHash de la photo originale d'un bien.
 */
class MediaFingerprint extends AbstractModel
{
    protected $fillable = ['media_id', 'property_id', 'agency_id', 'hash', 'band_0', 'band_1', 'band_2', 'band_3'];

    protected $casts = [
        'hash' => 'integer',
        'band_0' => 'integer',
        'band_1' => 'integer',
        'band_2' => 'integer',
        'band_3' => 'integer',
    ];

    public function media(): BelongsTo
    {
        return $this->belongsTo(Media::class);
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }
}
