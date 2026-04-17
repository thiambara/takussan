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
}
