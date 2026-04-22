<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Agency-scoped member role assignment.
 *
 * Separate from {@see UserRoleController} which is the cross-tenant endpoint.
 * This endpoint enforces that the target user must already be a member of the
 * agency in the URL — it is the canonical way for an agency_admin to (re)assign
 * a role to a member of their own agency without risking cross-agency drift.
 *
 * Route: PUT /api/agencies/{agency}/members/{user}/role
 */
class AgencyMemberRoleController extends Controller
{
    public function update(Request $request, Agency $agency, User $user): JsonResponse
    {
        $actor = $request->user();

        // Super admin bypasses agency membership checks, otherwise:
        //   - actor must administer the target agency (primary_admin or
        //     top-level admin/agency_admin role)
        //   - target user must belong to that agency
        abort_unless(
            $actor->hasRole('super_admin')
                || $agency->primary_admin_id === $actor->id
                || ($actor->agency_id === $agency->id && $actor->hasRole(['admin', 'agency_admin'])),
            403,
        );

        abort_unless($user->agency_id === $agency->id, 422, __('messages.user_not_in_agency'));

        $data = $request->validate([
            'role' => ['required', 'string', Rule::in($this->allowedRoles())],
        ]);

        if ($data['role'] === 'super_admin' && ! $actor->hasRole('super_admin')) {
            abort(403, __('messages.only_super_admin_can_grant_super_admin'));
        }

        $registrar = app(PermissionRegistrar::class);
        $teamId = $data['role'] === 'super_admin' ? null : $agency->id;
        $registrar->setPermissionsTeamId($teamId);

        // Ensure the role exists in the target team context under the `web`
        // guard (matches RolesAndPermissionsSeeder) — without pinning the
        // guard, spatie would default to the current request guard and create
        // a ghost duplicate role row.
        Role::findOrCreate($data['role'], 'web');

        $user->syncRoles([$data['role']]);

        return $this->json([
            'data' => [
                'user_id' => $user->id,
                'agency_id' => $agency->id,
                'role' => $data['role'],
                'roles' => $user->getRoleNames(),
            ],
        ]);
    }

    /**
     * @return list<string>
     */
    protected function allowedRoles(): array
    {
        return [
            'super_admin',
            'admin',
            'agency_admin',
            'agent',
            'owner',
            'tenant',
            'customer',
            'service_provider',
        ];
    }
}
