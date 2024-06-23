<?php

namespace App\Models;

use App\Models\base\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Address extends AbstractModel
{
    use HasFactory;

    protected $fillable = [
        'owner_id',
        'owner_type',
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

    public function owner(): MorphTo
    {
        return $this->morphTo();
    }
}
