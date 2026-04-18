<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Bases\Auditable;
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
    use Auditable, HasFactory, InteractsWithMedia, Searchable, SoftDeletes;

    protected $fillable = [
        'user_id', 'agency_id', 'parent_id', 'reference_number',
        'title', 'slug', 'description',
        'type', 'contract_type', 'title_type', 'status', 'visibility',
        'price', 'currency',
        'area', 'bedrooms', 'bathrooms', 'furnished',
        'floor_number', 'total_floors', 'year_built', 'parking_spaces',
        'featured', 'lot_position', 'level', 'admin_monitored',
        'available_from', 'published_at', 'metadata',
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
        'level' => 'integer',
        'admin_monitored' => 'boolean',
        'available_from' => 'date',
        'published_at' => 'datetime',
        'metadata' => 'array',
    ];

    /** @var array<int,string> */
    protected static array $requestFilterable = [
        'user_id', 'agency_id', 'parent_id', 'type', 'contract_type',
        'status', 'visibility', 'title_type', 'price', 'bedrooms', 'bathrooms',
        'area', 'currency', 'featured', 'furnished', 'published_at',
    ];

    /** @var array<int,string> */
    protected static array $requestSortable = [
        'id', 'created_at', 'published_at', 'price', 'area', 'bedrooms', 'bathrooms', 'featured',
    ];

    /** @var array<int,string> */
    protected static array $requestLoadable = [
        'address', 'agency', 'owner', 'tags', 'children', 'parent',
    ];

    /** @var array<int,string> */
    protected static array $requestCountable = [
        'bookings', 'leases', 'visits', 'reviews', 'children',
    ];

    /** @var array<int,string> */
    protected static array $requestRangeFilters = ['price', 'area'];

    /** @var array<int,string> */
    protected static array $requestSearchFields = ['title', 'reference_number', 'description'];

    /** @var array<int,string> */
    protected static array $queryFields = [
        'id', 'user_id', 'agency_id', 'parent_id', 'reference_number',
        'title', 'slug', 'type', 'contract_type', 'title_type', 'status', 'visibility',
        'price', 'currency', 'area', 'bedrooms', 'bathrooms', 'furnished',
        'floor_number', 'total_floors', 'year_built', 'parking_spaces', 'featured',
        'available_from', 'published_at', 'created_at', 'updated_at',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->slug)) {
                $m->slug = Str::slug($m->title).'-'.Str::random(6);
            }
            if (empty($m->reference_number)) {
                $m->reference_number = 'TK-'.now()->format('Y').'-'.strtoupper(Str::random(6));
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
            ->whereNotNull('published_at')
            ->whereNotIn('status', [
                PropertyStatus::Draft,
                PropertyStatus::Sold,
                PropertyStatus::Rented,
                PropertyStatus::Archived,
                PropertyStatus::UnderMaintenance,
                PropertyStatus::Unavailable,
            ]);
    }

    public function scopeAvailable(Builder $query): Builder
    {
        return $query->where('status', PropertyStatus::Available);
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('photos')
            ->acceptsMimeTypes(['image/jpeg', 'image/png', 'image/webp']);

        $this->addMediaCollection('videos')
            ->acceptsMimeTypes(['video/mp4', 'video/webm', 'video/quicktime']);

        $this->addMediaCollection('plans')
            ->acceptsMimeTypes(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
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
