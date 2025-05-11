<?php

namespace App\Models;

use App\Models\Bases\BaseModelInterface;
use App\Models\Bases\BaseModelTrait;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
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
        'roles',
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
        'email_verified_at' => 'datetime',
        'roles' => 'array',
        'metadata' => 'array',
    ];

    public function __construct(array $attributes = [])
    {
        $this->init();
        parent::__construct($attributes);
    }

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

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function added_by()
    {
        return $this->belongsTo(User::class, 'added_by_id');
    }

    public function hasRoles(array|string $roles, bool $all = false): bool
    {
        $roles = collect(is_array($roles) ? $roles : [$roles]);
        if ($all) {
            return $roles->intersect($this->roles ?? [])->count() === $roles->count();
        }
        return $roles->intersect($this->roles ?? [])->count() > 0;
    }

    public function hasRole(string|int|Role $role): bool
    {
        if (is_string($role)) {
            return $this->assignedRoles()->where('name', $role)->exists();
        } elseif (is_int($role)) {
            return $this->assignedRoles()->where('id', $role)->exists();
        }

        return $this->assignedRoles()->where('id', $role->id)->exists();
    }

    public function assignedRoles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_has_roles');
    }

    public function assignRoles(array|Role $roles): self
    {
        $roles = is_array($roles) ? $roles : [$roles];
        $roleIds = collect($roles)->map(function ($role) {
            return $role instanceof Role ? $role->id : $role;
        })->toArray();

        $this->assignedRoles()->syncWithoutDetaching($roleIds);

        return $this;
    }

    public function removeRoles(array|Role $roles): self
    {
        $roles = is_array($roles) ? $roles : [$roles];
        $roleIds = collect($roles)->map(function ($role) {
            return $role instanceof Role ? $role->id : $role;
        })->toArray();

        $this->assignedRoles()->detach($roleIds);

        return $this;
    }

    public function syncRoles(array $roles): self
    {
        $roleIds = collect($roles)->map(function ($role) {
            return $role instanceof Role ? $role->id : $role;
        })->toArray();

        $this->assignedRoles()->sync($roleIds);

        return $this;
    }

    public function hasPermission(string|int|Permission $permission): bool
    {
        $permissionName = is_string($permission) ? $permission : (
        is_int($permission) ? Permission::find($permission)?->name : $permission->name
        );

        return $this->assignedRoles()
            ->whereHas('permissions', function ($query) use ($permissionName) {
                $query->where('name', $permissionName);
            })
            ->exists();
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
}
