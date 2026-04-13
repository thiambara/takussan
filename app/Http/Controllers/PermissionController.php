<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Services\Model\PermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Permission;

class PermissionController extends Controller
{
    public function __construct(private readonly PermissionService $permissionService)
    {
        $this->middleware('permission:permissions.view')->only(['index', 'show']);
        $this->middleware('permission:permissions.create')->only(['store']);
        $this->middleware('permission:permissions.update')->only(['update']);
        $this->middleware('permission:permissions.delete')->only(['destroy']);
    }

    /**
     * Display a listing of permissions.
     */
    public function index(): JsonResponse
    {
        $permissions = Permission::all();
        return $this->json($permissions);
    }

    /**
     * Store a newly created permission.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|unique:permissions,name',
            'guard_name' => 'nullable|string',
        ]);

        $permission = $this->permissionService->create($validated);
        return $this->json($permission, 201);
    }

    /**
     * Display the specified permission.
     */
    public function show(Permission $permission): JsonResponse
    {
        return $this->json($permission);
    }

    /**
     * Update the specified permission.
     */
    public function update(Request $request, Permission $permission): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|unique:permissions,name,' . $permission->id,
        ]);

        $permission = $this->permissionService->update($permission, $validated);
        return $this->json($permission);
    }

    /**
     * Remove the specified permission.
     */
    public function destroy(Permission $permission): JsonResponse
    {
        $this->permissionService->delete($permission);
        return $this->json(['status' => 'success', 'message' => 'Permission deleted successfully']);
    }
}
