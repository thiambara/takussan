<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Services\Geo\GeoAddressCanonicalizer;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Address extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'addressable_id', 'addressable_type',
        'label', 'street', 'neighborhood', 'city', 'region',
        'country', 'postal_code', 'latitude', 'longitude', 'metadata',
        // TCK-633 — le référentiel (ADR-0062) : canonisés par `GeoAddressCanonicalizer`.
        'geo_city_id', 'geo_neighborhood_id',
    ];

    protected $casts = [
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
        'metadata' => 'array',
    ];

    public function addressable(): MorphTo
    {
        return $this->morphTo();
    }

    /**
     * TCK-633 (ADR-0062 §4) — toute écriture d'adresse passe par la canonisation. Elle vit ICI et
     * non dans `PropertyController` : aucune écriture ne la contourne — création, modification,
     * duplication, rattachement en console.
     */
    protected static function booted(): void
    {
        static::saving(fn (self $adresse) => app(GeoAddressCanonicalizer::class)->canoniser($adresse));
    }

    public function geoCity(): BelongsTo
    {
        return $this->belongsTo(GeoCity::class, 'geo_city_id');
    }

    public function geoNeighborhood(): BelongsTo
    {
        return $this->belongsTo(GeoNeighborhood::class, 'geo_neighborhood_id');
    }

    /**
     * Composed, human-readable full address used by PDF templates and other views.
     * Returns null when every component is empty so callers can rely on ??-fallbacks.
     */
    public function getFullAddressAttribute(): ?string
    {
        $cityLine = trim(implode(' ', array_filter([
            $this->postal_code ?? null,
            $this->city ?? null,
        ], fn ($p) => $p !== null && $p !== '')));

        $parts = array_filter([
            $this->street ?? null,
            $this->neighborhood ?? null,
            $cityLine !== '' ? $cityLine : null,
            $this->region ?? null,
            $this->country ?? null,
        ], fn ($p) => $p !== null && $p !== '');

        return $parts === [] ? null : implode(', ', $parts);
    }
}
