<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\AgencyStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;
use LemonSqueezy\Laravel\Billable as LemonSqueezyBillable;
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;

class Agency extends AbstractModel implements HasMedia
{
    // TCK-079: Lemon Squeezy `Billable` makes Agency the scope used to
    // create checkouts (`$agency->checkout(...)->withCustomPrice(...)`).
    use HasFactory, InteractsWithMedia, LemonSqueezyBillable, SoftDeletes;

    protected $fillable = [
        'name', 'slug', 'license_number', 'description',
        'email', 'phone', 'website', 'commission_rate',
        'founded_at', 'is_verified', 'verified_at',
        'primary_admin_id', 'status', 'metadata', 'settings',
    ];

    protected $casts = [
        'founded_at' => 'date',
        'is_verified' => 'boolean',
        'verified_at' => 'datetime',
        'commission_rate' => 'decimal:2',
        'average_rating' => 'decimal:2',
        'status' => AgencyStatus::class,
        'metadata' => 'array',
        'settings' => 'array',
    ];

    protected static array $requestFilterable = ['status', 'is_verified', 'primary_admin_id'];

    protected static array $requestSortable = ['id', 'name', 'created_at', 'founded_at'];

    protected static array $requestLoadable = ['primaryAdmin', 'addresses'];

    protected static array $requestCountable = ['members', 'properties'];

    protected static array $requestSearchFields = ['name', 'email', 'license_number'];

    protected static array $queryFields = [
        'id', 'name', 'slug', 'license_number', 'description',
        'email', 'phone', 'website', 'commission_rate',
        'founded_at', 'is_verified', 'status', 'created_at', 'updated_at',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $m) {
            if (empty($m->slug)) {
                $m->slug = Str::slug($m->name).'-'.Str::random(5);
            }
        });
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('logo')->singleFile();
    }

    public function primaryAdmin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'primary_admin_id');
    }

    public function members(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function properties(): HasMany
    {
        return $this->hasMany(Property::class);
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class);
    }

    public function addresses(): MorphMany
    {
        return $this->morphMany(Address::class, 'addressable');
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function payouts(): HasMany
    {
        return $this->hasMany(Payout::class);
    }

    public function reviews(): MorphMany
    {
        return $this->morphMany(Review::class, 'reviewable');
    }

    public function leases(): HasMany
    {
        return $this->hasMany(Lease::class);
    }
}
