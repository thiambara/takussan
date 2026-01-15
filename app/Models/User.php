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

class User extends Authenticatable implements BaseModelInterface
{
    use BaseModelTrait, HasApiTokens, HasFactory, Notifiable, SoftDeletes;

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

    // ACCESSORS & MUTATORS

    protected function fullName(): Attribute
    {
        return Attribute::make(
            get: fn () => trim("{$this->first_name} {$this->last_name}"),
        );
    }

    /**
     * Get the roles as an array of codes (Backward compatibility for frontend).
     */
    protected function roles(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->assigned_roles->pluck('code')->toArray(),
        );
    }

    // SCOPES

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', UserStatus::Active);
    }


    // RELATIONSHIPS

    public function addresses(): MorphMany
    {
        return $this->morphMany(Address::class, 'addressable');
    }

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

    public function hasRole(string|int|Role $role): bool
    {
        if (is_string($role)) {
            return $this->assigned_roles()->where('code', $role)->exists();
        } elseif (is_int($role)) {
            return $this->assigned_roles()->where('id', $role)->exists();
        }

        return $this->assigned_roles()->where('id', $role->id)->exists();
    }

    public function assigned_roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_has_roles');
    }

    // LOGIC METHODS

    public function assignRoles(array|Role $roles): self
    {
        $roles = is_array($roles) ? $roles : [$roles];
        $roleIds = collect($roles)->map(function ($role) {
            return $role instanceof Role ? $role->id : $role;
        })->toArray();

        $this->assigned_roles()->syncWithoutDetaching($roleIds);

        return $this;
    }

    public function removeRoles(array|Role $roles): self
    {
        $roles = is_array($roles) ? $roles : [$roles];
        $roleIds = collect($roles)->map(function ($role) {
            return $role instanceof Role ? $role->id : $role;
        })->toArray();

        $this->assigned_roles()->detach($roleIds);

        return $this;
    }

    public function syncRoles(array $roles): self
    {
        $roleIds = collect($roles)->map(function ($role) {
            return $role instanceof Role ? $role->id : $role;
        })->toArray();

        $this->assigned_roles()->sync($roleIds);

        return $this;
    }

    public function hasPermission(string|int|Permission $permission): bool
    {
        $permissionCode = is_string($permission)
            ? $permission
            : (is_int($permission) ? Permission::find($permission)?->code : $permission->code);

        return $this->assigned_roles()
            ->whereHas('permissions', function ($query) use ($permissionCode) {
                $query->where('code', $permissionCode);
            })
            ->exists();
    }

    public function customer(): HasOne
    {
        return $this->hasOne(Customer::class, 'user_id');
    }

    public function agency(): BelongsTo
    {
        return $this->belongsTo(Agency::class);
    }
}
