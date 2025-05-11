<?php

namespace App\Services;

use App\Models\Permission;

class PermissionService
{
    /**
     * Create a new permission
     */
    public function create(array $data): Permission
    {
        return Permission::create([
            'code' => $data['code'],
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
        ]);
    }

    /**
     * Update a permission
     */
    public function update(Permission $permission, array $data): Permission
    {
        $permission->update([
            'code' => $data['code'] ?? $permission->code,
            'name' => $data['name'] ?? $permission->name,
            'description' => $data['description'] ?? $permission->description,
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
