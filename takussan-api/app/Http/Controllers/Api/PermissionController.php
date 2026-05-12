<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

/**
 * TCK-135 — read-only catalogue of permissions for the role editor.
 *
 * Permissions follow the `<resource>.<action>` convention seeded by
 * `Database\Seeders\System\RolesAndPermissionsSeeder`. The catalogue is
 * grouped by resource so the frontend can render a permission matrix
 * without re-deriving the prefix client-side. Custom permissions that
 * don't follow the convention (e.g. `roles.manage_in_agency` is treated
 * here as resource=`roles`) fall into their own group naturally.
 */
class PermissionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $agencyId = $request->activeProfile()?->agency_id ?? $user?->agency_id;

        // Only role-managers (or globals) may inspect the catalogue —
        // this list reveals the platform's access surface and isn't
        // useful to other roles.
        abort_unless($user !== null, 401);
        if (! $user->isSuperAdmin()) {
            abort_unless($agencyId !== null, 403);
            app(PermissionRegistrar::class)->setPermissionsTeamId($agencyId);
            $user->unsetRelation('roles');
            $user->unsetRelation('permissions');
            abort_unless($user->can('roles.manage_in_agency'), 403);
        }

        $permissions = Permission::query()
            ->where('guard_name', 'web')
            ->orderBy('name')
            ->get(['id', 'name']);

        $grouped = [];
        foreach ($permissions as $permission) {
            [$resource] = explode('.', $permission->name, 2) + [1 => ''];
            $grouped[$resource] ??= [];
            $grouped[$resource][] = [
                'id' => $permission->id,
                'name' => $permission->name,
                'action' => substr($permission->name, strlen($resource) + 1) ?: $permission->name,
            ];
        }

        $data = [];
        foreach ($grouped as $resource => $perms) {
            $data[] = [
                'resource' => $resource,
                'permissions' => $perms,
            ];
        }

        return $this->json(['data' => $data]);
    }
}
