<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * TCK-633 (ADR-0062 §2) — la VILLE telle que les annonces la nomment : la commune, sauf dans
 * l'agglomération dakaroise où c'est le département (Dakar, Pikine, Guédiawaye, Keur Massar), ses
 * communes d'arrondissement devenant des quartiers.
 */
class GeoCity extends AbstractModel
{
    use HasFactory;

    protected $fillable = ['geo_region_id', 'slug', 'name', 'latitude', 'longitude'];

    protected $casts = [
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
    ];

    protected static array $requestFilterable = ['geo_region_id'];

    protected static array $requestSortable = ['id', 'name'];

    protected static array $queryFields = ['id', 'geo_region_id', 'slug', 'name', 'latitude', 'longitude'];

    public function region(): BelongsTo
    {
        return $this->belongsTo(GeoRegion::class, 'geo_region_id');
    }

    public function neighborhoods(): HasMany
    {
        return $this->hasMany(GeoNeighborhood::class);
    }
}
