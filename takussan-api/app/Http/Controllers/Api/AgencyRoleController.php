<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class AgencyRoleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->agency_id, 403);

        app(PermissionRegistrar::class)->setPermissionsTeamId($user->agency_id);

        $roles = Role::query()
            ->where('team_id', $user->agency_id)
            ->get(['id', 'name', 'guard_name']);

        return $this->json(['data' => $roles]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->authorizeAgencyAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string'],
        ]);

        app(PermissionRegistrar::class)->setPermissionsTeamId($user->agency_id);

        $role = Role::create([
            'name' => $data['name'],
            'guard_name' => 'web',
            'team_id' => $user->agency_id,
        ]);

        if (! empty($data['permissions'])) {
            $role->syncPermissions($data['permissions']);
        }

        return $this->json(['data' => $role->load('permissions')], 201);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        $user = $request->user();
        $this->authorizeAgencyAdmin($request);
        $teamsKey = app(PermissionRegistrar::class)->teamsKey;
        abort_if((int) $role->{$teamsKey} !== (int) $user->agency_id, 403);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['string'],
        ]);

        if (isset($data['name'])) {
            $role->update(['name' => $data['name']]);
        }

        if (isset($data['permissions'])) {
            $role->syncPermissions($data['permissions']);
        }

        return $this->json(['data' => $role->refresh()->load('permissions')]);
    }

    public function destroy(Request $request, Role $role): JsonResponse
    {
        $user = $request->user();
        $this->authorizeAgencyAdmin($request);
        $teamsKey = app(PermissionRegistrar::class)->teamsKey;
        abort_if((int) $role->{$teamsKey} !== (int) $user->agency_id, 403);

        $role->delete();

        return $this->json(null, 204);
    }

    protected function authorizeAgencyAdmin(Request $request): void
    {
        $user = $request->user();
        abort_unless($user->agency_id, 403);

        app(PermissionRegistrar::class)->setPermissionsTeamId($user->agency_id);

        $agency = $user->agency;
        abort_unless(
            $user->hasRole(['admin', 'super_admin']) || ($agency && $agency->primary_admin_id === $user->id),
            403,
        );
    }
}
