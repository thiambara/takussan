<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Address extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'addressable_id', 'addressable_type',
        'label', 'street', 'neighborhood', 'city', 'region',
        'country', 'postal_code', 'latitude', 'longitude', 'metadata',
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
