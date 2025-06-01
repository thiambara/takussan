<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Spatie\Image\Manipulations;
use Spatie\MediaLibrary\MediaCollections\File;

class Property extends AbstractModel implements HasMedia
{
    use HasFactory, SoftDeletes, InteractsWithMedia;
    
    /**
     * Register media conversions for the model.
     *
     * @param Media|null $media
     * @return void
     */
    public function registerMediaConversions(Media $media = null): void
    {
        $this->addMediaConversion('thumbnail')
            ->width(300)
            ->height(300)
            ->optimize()
            ->nonQueued();
            
        $this->addMediaConversion('preview')
            ->width(800)
            ->height(600)
            ->optimize()
            ->nonQueued();
    }
    
    /**
     * Register media collections for the model.
     *
     * @return void
     */
    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('properties')
            ->acceptsMimeTypes(['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime', 'application/pdf'])
            ->useDisk('public');
    }

    protected $table = 'properties';

    protected $casts = [
        'servicing' => 'array',
        'metadata' => 'array',
    ];

    protected $fillable = [
        'parent_id',
        'user_id',
        'title',
        'description',
        'type',
        'status',
        'visibility',
        'price',
        'area',
        'position',
        'level',
        'title_type',
        'with_administrative_monitoring',
        'contract_type',
        'servicing',
        'metadata'
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function address(): MorphOne
    {
        return $this->morphOne(Address::class, 'addressable');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Property::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Property::class, 'parent_id');
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function collaborators(): HasMany
    {
        return $this->hasMany(PropertyCollaborator::class);
    }

    public function collaborating_users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'property_collaborators')
            ->withPivot(['role', 'permissions', 'notes', 'invited_by', 'invitation_accepted', 'invitation_date', 'accepted_date'])
            ->withTimestamps();
    }

    public function tags(): MorphToMany
    {
        return $this->morphToMany(Tag::class, 'taggable');
    }

    public function reviews(): MorphMany
    {
        return $this->morphMany(Review::class, 'model');
    }
}
