<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use Illuminate\Support\Str;

class Property extends AbstractModel
{
    protected $fillable = [
        'title', 'slug', 'description', 'type', 'status',
        'price', 'location_quarter', 'location_city',
        'bedrooms', 'bathrooms', 'area', 'featured',
        'owner_phone', 'main_photo_url', 'published_at',
    ];

    protected $casts = [
        'type' => PropertyType::class,
        'status' => PropertyStatus::class,
        'featured' => 'boolean',
        'published_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (Property $property) {
            if (empty($property->slug)) {
                $property->slug = Str::slug($property->title).'-'.Str::random(6);
            }
        });
    }

    public function scopePublished($query)
    {
        return $query->where('status', PropertyStatus::Published);
    }
}
