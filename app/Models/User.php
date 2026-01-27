<?php

namespace App\Models;

use App\Models\Bases\BaseModelInterface;
use App\Models\Bases\BaseModelTrait;
use App\Models\Bases\Enums\UserStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable implements BaseModelInterface
{
    use BaseModelTrait, HasApiTokens, HasFactory, Notifiable, SoftDeletes, HasRoles;

    protected $table = 'users';

    protected $fillable = [
        'first_name',
        'last_name',
        'phone',
        'username',
        'email',
        'status',
        'password',
        'type',
        'added_by_id',
        'agency_id',
        'email_verified_at',
        'remember_token',
        'google_id',
        'metadata',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'status' => UserStatus::class,
        'email_verified_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected $appends = ['full_name', 'roles'];

    public function __construct(array $attributes = [])
    {
        $this->init();
        parent::__construct($attributes);
    }

    // SCOPES &
    // ========

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', UserStatus::Active);
    }

    // ACCESSORS & MUTATORS
    // ====================

    public function addresses(): MorphMany
    {
        return $this->morphMany(Address::class, 'addressable');
    }

    // RELATIONSHIPS
    // ============

    public function properties(): HasMany
    {
        return $this->hasMany(Property::class);
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class, 'added_by_id');
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function booking_payments(): HasMany
    {
        return $this->hasMany(BookingPayment::class);
    }

    public function added_by(): BelongsTo
    {
        return $this->belongsTo(User::class, 'added_by_id');
    }

    public function customer_relationships(): HasMany
    {
        return $this->hasMany(UserCustomerRelationship::class);
    }

    public function related_customers(): BelongsToMany
    {
        return $this->belongsToMany(Customer::class, 'user_customer_relationships')
            ->withPivot(['relationship_type', 'is_primary', 'status', 'start_date', 'end_date', 'notes'])
            ->withTimestamps();
    }

    public function customer(): HasOne
    {
        return $this->hasOne(Customer::class, 'user_id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    protected function fullName(): Attribute
    {
        return Attribute::make(
            get: fn() => trim("{$this->first_name} {$this->last_name}"),
        );
    }

}
