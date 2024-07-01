<?php

namespace App\Models;

use App\Models\base\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Address extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'addressable_id',
        'addressable_type',
        'address',
        'country',
        'state',
        'city',
        'district',
        'street',
        'building',
        'latitude',
        'longitude',
        'extra',
    ];

    public function addressable(): MorphTo
    {
        return $this->morphTo();
    }
}
