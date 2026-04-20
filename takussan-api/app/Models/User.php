<?php

namespace App\Models;

use App\Models\Concerns\HasQueryBuilder;
use App\Models\Enums\UserStatus;
use App\Models\Enums\UserType;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
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
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable implements HasMedia, MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasQueryBuilder, HasRoles, InteractsWithMedia, Notifiable, SoftDeletes;

    protected $fillable = [
        'username', 'first_name', 'last_name', 'type', 'status',
        'email', 'password', 'phone',
        'bio', 'preferred_language', 'timezone',
        'last_login_at', 'agency_id', 'added_by_id',
        'google_id', 'facebook_id', 'apple_id',
        'two_factor_enabled', 'two_factor_secret', 'two_factor_recovery_codes',
        'email_verified_at', 'phone_verified_at',
        'notifications_email_enabled', 'notifications_push_enabled', 'notifications_sms_enabled',
        'metadata',
    ];

    protected $hidden = [
        'password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'type' => UserType::class,
            'status' => UserStatus::class,
            'two_factor_enabled' => 'boolean',
            'two_factor_secret' => 'encrypted',
            'two_factor_recovery_codes' => 'encrypted',
            'notifications_email_enabled' => 'boolean',
            'notifications_push_enabled' => 'boolean',
            'notifications_sms_enabled' => 'boolean',
            'metadata' => 'array',
        ];
    }

    protected static array $requestFilterable = ['agency_id', 'type', 'status', 'added_by_id'];

    protected static array $requestSortable = ['id', 'created_at', 'first_name', 'last_name', 'email', 'status'];

    protected static array $requestLoadable = ['agency'];

    protected static array $requestSearchFields = ['first_name', 'last_name', 'email', 'username', 'phone'];

    protected static array $queryFields = [
        'id', 'username', 'first_name', 'last_name', 'email', 'phone',
        'type', 'status', 'agency_id', 'bio', 'preferred_language',
        'timezone', 'last_login_at', 'created_at', 'updated_at',
    ];

    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('avatar')->singleFile();
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }

    public function addedBy(): BelongsTo
    {
        return $this->belongsTo(self::class, 'added_by_id');
    }

    public function properties(): HasMany
    {
        return $this->hasMany(Property::class);
    }

    public function customer(): HasOne
    {
        return $this->hasOne(Customer::class);
    }

    public function addresses(): MorphMany
    {
        return $this->morphMany(Address::class, 'addressable');
    }

    public function documents(): MorphMany
    {
        return $this->morphMany(Document::class, 'documentable');
    }

    public function favorites(): HasMany
    {
        return $this->hasMany(Favorite::class);
    }

    public function savedSearches(): HasMany
    {
        return $this->hasMany(SavedSearch::class);
    }

    public function appNotifications(): HasMany
    {
        return $this->hasMany(AppNotification::class);
    }

    public function leases(): HasMany
    {
        return $this->hasMany(Lease::class, 'landlord_id');
    }

    public function writtenReviews(): HasMany
    {
        return $this->hasMany(Review::class, 'author_id');
    }

    public function payouts(): HasMany
    {
        return $this->hasMany(Payout::class, 'landlord_id');
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class, 'created_by_id');
    }

    public function bookingPayments(): HasMany
    {
        return $this->hasMany(BookingPayment::class);
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class, 'added_by_id');
    }

    public function customerRelationships(): HasMany
    {
        return $this->hasMany(UserCustomerRelationship::class);
    }

    public function relatedCustomers(): BelongsToMany
    {
        return $this->belongsToMany(Customer::class, 'user_customer_relationships');
    }

    public function receivedReviews(): MorphMany
    {
        return $this->morphMany(Review::class, 'reviewable');
    }

    public function conversations()
    {
        return $this->belongsToMany(Conversation::class, 'conversation_participants')
            ->using(ConversationParticipant::class)
            ->withPivot(['role', 'last_read_at', 'is_muted', 'joined_at', 'left_at'])
            ->withTimestamps();
    }
}
