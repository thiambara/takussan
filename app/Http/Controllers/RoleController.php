<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Services\Model\RoleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Role;

class RoleController extends Controller
{
    public function __construct(private readonly RoleService $roleService)
    {
        $this->middleware('permission:roles.view')->only(['index', 'show']);
        $this->middleware('permission:roles.create')->only(['store']);
        $this->middleware('permission:roles.update')->only(['update', 'syncPermissions']);
        $this->middleware('permission:roles.delete')->only(['destroy']);
    }

    /**
     * Display a listing of roles.
     */
    public function index(): JsonResponse
    {
        $roles = Role::with('permissions')->get();
        return $this->json($roles);
    }

    /**
     * Store a newly created role.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|unique:roles,name',
            'guard_name' => 'nullable|string',
            'permissions' => 'nullable|array',
            'permissions.*' => 'string|exists:permissions,name',
        ]);

        $role = $this->roleService->create($validated);
        return $this->json($role, 201);
    }

    /**
     * Display the specified role.
     */
    public function show(Role $role): JsonResponse
    {
        return $this->json($role->load('permissions'));
    }

    /**
     * Update the specified role.
     */
    public function update(Request $request, Role $role): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|unique:roles,name,' . $role->id,
            'permissions' => 'nullable|array',
            'permissions.*' => 'string|exists:permissions,name',
        ]);

        $role = $this->roleService->update($role, $validated);
        return $this->json($role);
    }

    /**
     * Sync permissions for a role.
     */
    public function syncPermissions(Request $request, Role $role): JsonResponse
    {
        $validated = $request->validate([
            'permissions' => 'required|array',
            'permissions.*' => 'string|exists:permissions,name',
        ]);

        $role = $this->roleService->syncPermissions($role, $validated['permissions']);
        return $this->json($role->load('permissions'));
    }

    /**
     * Remove the specified role.
     */
    public function destroy(Role $role): JsonResponse
    {
        $this->roleService->delete($role);
        return $this->json(['status' => 'success', 'message' => 'Role deleted successfully']);
    }
}
