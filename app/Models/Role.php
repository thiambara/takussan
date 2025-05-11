<?php

namespace App\Models;

use App\Models\Bases\BaseModelInterface;
use App\Models\Bases\BaseModelTrait;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Role extends Model implements BaseModelInterface
{
    use BaseModelTrait, HasFactory;

    protected $table = 'roles';

    protected $fillable = [
        'code',
        'name',
        'description',
    ];

    public function __construct(array $attributes = [])
    {
        $this->init();
        parent::__construct($attributes);
    }

    // RELATIONSHIPS

    /**
     * The users that belong to the role.
     */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_has_roles');
    }

    /**
     * Check if the role has a specific permission
     */
    public function hasPermission(string|int|Permission $permission): bool
    {
        if (is_string($permission)) {
            return $this->permissions()->where('name', $permission)->exists();
        } elseif (is_int($permission)) {
            return $this->permissions()->where('id', $permission)->exists();
        }

        return $this->permissions()->where('id', $permission->id)->exists();
    }

    // LOGIC METHODS

    /**
     * The permissions that belong to the role.
     */
    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'role_has_permissions');
    }

    /**
     * Give permissions to the role
     */
    public function givePermissionsTo(array|Permission $permissions): self
    {
        $permissions = is_array($permissions) ? $permissions : [$permissions];
        $permissionIds = collect($permissions)->map(function ($permission) {
            return $permission instanceof Permission ? $permission->id : $permission;
        })->toArray();

        $this->permissions()->syncWithoutDetaching($permissionIds);

        return $this;
    }

    /**
     * Revoke permissions from the role
     */
    public function revokePermissions(array|Permission $permissions): self
    {
        $permissions = is_array($permissions) ? $permissions : [$permissions];
        $permissionIds = collect($permissions)->map(function ($permission) {
            return $permission instanceof Permission ? $permission->id : $permission;
        })->toArray();

        $this->permissions()->detach($permissionIds);

        return $this;
    }

    /**
     * Sync permissions for the role
     */
    public function syncPermissions(array $permissions): self
    {
        $permissionIds = collect($permissions)->map(function ($permission) {
            return $permission instanceof Permission ? $permission->id : $permission;
        })->toArray();

        $this->permissions()->sync($permissionIds);

        return $this;
    }
}
