<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Address extends AbstractModel
{
    use HasFactory;

    protected $table = 'addresses';

    protected $fillable = [
        'addressable_id',
        'addressable_type',
        'address',
        'country',
        'state',
        'city',
        'district',
        'street',
        'postal_code',
        'building',
        'latitude',
        'longitude',
        'metadata',
        'created_at',
        'updated_at',
    ];

    public function addressable(): MorphTo
    {
        return $this->morphTo();
    }
}
