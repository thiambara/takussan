<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** TCK-633 (ADR-0062) — une des 14 régions du Sénégal (`code` ISO 3166-2 : `SN-DK`…). */
class GeoRegion extends AbstractModel
{
    use HasFactory;

    protected $fillable = ['code', 'slug', 'name', 'latitude', 'longitude'];

    protected $casts = [
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
    ];

    protected static array $requestSortable = ['id', 'name'];

    protected static array $queryFields = ['id', 'code', 'slug', 'name', 'latitude', 'longitude'];

    public function cities(): HasMany
    {
        return $this->hasMany(GeoCity::class);
    }
}
