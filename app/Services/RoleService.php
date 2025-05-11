<?php

namespace App\Services;

use App\Models\Role;

class RoleService
{
    /**
     * Create a new role with optional permissions
     */
    public function create(array $data): Role
    {
        $role = Role::create([
            'code' => $data['code'],
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
        ]);

        if (isset($data['permissions']) && is_array($data['permissions'])) {
            $role->givePermissionsTo($data['permissions']);
        }

        return $role->load('permissions');
    }

    /**
     * Update a role with optional permissions
     */
    public function update(Role $role, array $data): Role
    {
        $role->update([
            'code' => $data['code'] ?? $role->code,
            'name' => $data['name'] ?? $role->name,
            'description' => $data['description'] ?? $role->description,
        ]);

        if (isset($data['permissions']) && is_array($data['permissions'])) {
            $role->syncPermissions($data['permissions']);
        }

        return $role->load('permissions');
    }

    /**
     * Delete a role and its relationships
     */
    public function delete(Role $role): bool
    {
        return $role->delete();
    }

    /**
     * Sync permissions for a role
     */
    public function syncPermissions(Role $role, array $permissionIds): Role
    {
        $role->syncPermissions($permissionIds);
        return $role;
    }
}
