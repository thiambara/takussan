<?php

namespace App\Services\Model;

use Spatie\Permission\Models\Role;

class RoleService
{
    /**
     * Create a new role with optional permissions
     */
    public function create(array $data): Role
    {
        $role = Role::create([
            'name' => $data['name'],
            'guard_name' => $data['guard_name'] ?? 'web',
        ]);

        if (isset($data['permissions']) && is_array($data['permissions'])) {
            $role->syncPermissions($data['permissions']);
        }

        return $role->load('permissions');
    }

    /**
     * Update a role with optional permissions
     */
    public function update(Role $role, array $data): Role
    {
        $role->update([
            'name' => $data['name'] ?? $role->name,
        ]);

        if (isset($data['permissions']) && is_array($data['permissions'])) {
            $role->syncPermissions($data['permissions']);
        }

        return $role->load('permissions');
    }

    /**
     * Sync permissions for a role
     */
    public function syncPermissions(Role $role, array $permissionIds): Role
    {
        $role->syncPermissions($permissionIds);
        return $role;
    }

    /**
     * Delete a role and its relationships
     */
    public function delete(Role $role): bool
    {
        return $role->delete();
    }
}
