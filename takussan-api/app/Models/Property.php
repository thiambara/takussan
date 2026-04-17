<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\TitleType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;
use Laravel\Scout\Searchable;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class Property extends AbstractModel implements HasMedia
{
    use HasFactory, InteractsWithMedia, Searchable, SoftDeletes;

    protected $fillable = [
        'user_id', 'agency_id', 'parent_id', 'reference_number',
        'title', 'slug', 'description',
        'type', 'contract_type', 'title_type', 'status', 'visibility',
        'price', 'currency',
        'area', 'bedrooms', 'bathrooms', 'furnished',
        'floor_number', 'total_floors', 'year_built', 'parking_spaces',
        'featured', 'available_from', 'published_at', 'metadata',
    ];

    protected $casts = [
        'type' => PropertyType::class,
        'contract_type' => ContractType::class,
        'title_type' => TitleType::class,
        'status' => PropertyStatus::class,
        'visibility' => PropertyVisibility::class,
        'currency' => Currency::class,
        'price' => 'decimal:2',
        'average_rating' => 'decimal:2',
        'furnished' => 'boolean',
        'featured' => 'boolean',
        'available_from' => 'date',
        'published_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->slug)) {
                $m->slug = Str::slug($m->title).'-'.Str::random(6);
            }
        });
    }

    public function toSearchableArray(): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'type' => $this->type?->value,
            'contract_type' => $this->contract_type?->value,
            'status' => $this->status?->value,
            'city' => optional($this->address)->city,
        ];
    }

    public function shouldBeSearchable(): bool
    {
        return $this->visibility === PropertyVisibility::Public
            && $this->status !== PropertyStatus::Draft;
    }

    public function scopePublic(Builder $query): Builder
    {
        return $query->where('visibility', PropertyVisibility::Public)
            ->whereNotNull('published_at');
    }

    public function scopeAvailable(Builder $query): Builder
    {
        return $query->where('status', PropertyStatus::Available);
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('photos')
            ->acceptsMimeTypes(['image/jpeg', 'image/png', 'image/webp']);
    }

    public function registerMediaConversions(?Media $media = null): void
    {
        $this->addMediaConversion('thumbnail')->width(300)->height(300)->nonQueued();
        $this->addMediaConversion('preview')->width(800)->height(600)->nonQueued();
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function address(): MorphOne
    {
        return $this->morphOne(Address::class, 'addressable');
    }

    public function tags(): MorphToMany
    {
        return $this->morphToMany(Tag::class, 'taggable');
    }

    public function collaborators(): HasMany
    {
        return $this->hasMany(PropertyCollaborator::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function leases(): HasMany
    {
        return $this->hasMany(Lease::class);
    }

    public function visits(): HasMany
    {
        return $this->hasMany(PropertyVisit::class);
    }

    public function reviews(): MorphMany
    {
        return $this->morphMany(Review::class, 'reviewable');
    }

    public function priceHistory(): HasMany
    {
        return $this->hasMany(PropertyPriceHistory::class)->latest('changed_at');
    }

    public function maintenanceRequests(): HasMany
    {
        return $this->hasMany(MaintenanceRequest::class);
    }

    public function documents(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable');
    }
}
