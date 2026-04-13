<?php

namespace App\Services\Model;

use Spatie\Permission\Models\Permission;

class PermissionService
{
    /**
     * Create a new permission
     */
    public function create(array $data): Permission
    {
        return Permission::create([
            'name' => $data['name'],
            'guard_name' => $data['guard_name'] ?? 'web',
        ]);
    }

    /**
     * Update a permission
     */
    public function update(Permission $permission, array $data): Permission
    {
        $permission->update([
            'name' => $data['name'] ?? $permission->name,
        ]);

        return $permission;
    }

    /**
     * Delete a permission and its relationships
     */
    public function delete(Permission $permission): bool
    {
        return $permission->delete();
    }
}
