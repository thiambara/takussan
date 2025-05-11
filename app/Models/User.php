<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
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
        'extra',
    ];
    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];
    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'roles' => 'array',
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

    public function proprieties(): HasMany
    {
        return $this->hasMany(Propriety::class);
    }

    public function hasRoles(array|string $roles, bool $all = false): bool
    {
        $roles = collect(is_array($roles) ? $roles : [$roles]);
        if ($all) {
            return $roles->intersect($this->roles ?? [])->count() === $roles->count();
        }
        return $roles->intersect($this->roles ?? [])->count() > 0;
    }

    /**
     * The roles that belong to the user.
     */
    public function assignedRoles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_has_roles');
    }

    /**
     * Check if the user has a specific role
     */
    public function hasRole(string|int|Role $role): bool
    {
        if (is_string($role)) {
            return $this->assignedRoles()->where('name', $role)->exists();
        } elseif (is_int($role)) {
            return $this->assignedRoles()->where('id', $role)->exists();
        }

        return $this->assignedRoles()->where('id', $role->id)->exists();
    }

    /**
     * Assign roles to the user
     */
    public function assignRoles(array|Role $roles): self
    {
        $roles = is_array($roles) ? $roles : [$roles];
        $roleIds = collect($roles)->map(function ($role) {
            return $role instanceof Role ? $role->id : $role;
        })->toArray();
        
        $this->assignedRoles()->syncWithoutDetaching($roleIds);
        
        return $this;
    }

    /**
     * Remove roles from the user
     */
    public function removeRoles(array|Role $roles): self
    {
        $roles = is_array($roles) ? $roles : [$roles];
        $roleIds = collect($roles)->map(function ($role) {
            return $role instanceof Role ? $role->id : $role;
        })->toArray();
        
        $this->assignedRoles()->detach($roleIds);
        
        return $this;
    }

    /**
     * Sync roles for the user
     */
    public function syncRoles(array $roles): self
    {
        $roleIds = collect($roles)->map(function ($role) {
            return $role instanceof Role ? $role->id : $role;
        })->toArray();
        
        $this->assignedRoles()->sync($roleIds);
        
        return $this;
    }

    /**
     * Check if the user has a specific permission directly or through roles
     */
    public function hasPermission(string|int|Permission $permission): bool
    {
        // Permission can be provided as name (string), id (int) or Permission object
        $permissionName = is_string($permission) ? $permission : (
            is_int($permission) ? Permission::find($permission)?->name : $permission->name
        );
        
        // Check if any of the user's roles have this permission
        return $this->assignedRoles()
            ->whereHas('permissions', function ($query) use ($permissionName) {
                $query->where('name', $permissionName);
            })
            ->exists();
    }
}
