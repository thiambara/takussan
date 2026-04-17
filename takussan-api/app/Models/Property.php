<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Support\Str;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class Property extends AbstractModel implements HasMedia
{
    use HasFactory, InteractsWithMedia;

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

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PropertyStatus::Published);
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('photos')
            ->acceptsMimeTypes(['image/jpeg', 'image/png', 'image/webp']);
    }

    public function registerMediaConversions(?Media $media = null): void
    {
        $this->addMediaConversion('thumbnail')
            ->width(300)->height(225)->format('webp')->nonQueued();

        $this->addMediaConversion('medium')
            ->width(800)->height(600)->format('webp')->nonQueued();

        $this->addMediaConversion('large')
            ->width(1200)->height(900)->format('webp')->nonQueued();
    }
}
