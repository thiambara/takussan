<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Dedicated controller for the user role assignment endpoint.
 *
 * Separate from {@see UserAdminController} so role-management concerns
 * (authorization rules, team scoping, super_admin guard) live in one place.
 */
class UserRoleController extends Controller
{
    /**
     * Replace the target user's roles with the single role provided.
     *
     * PUT /api/users/{user}/role  { "role": "agent" }
     *
     * Rules:
     *   - Only `agency_admin` (within the target user's agency) or
     *     `super_admin` may change roles.
     *   - Only a `super_admin` may assign the `super_admin` role.
     */
    public function update(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();

        abort_unless(
            $actor->isSuperAdmin() || $actor->hasRole(['admin', 'agency_admin']),
            403,
        );

        $data = $request->validate([
            'role' => ['required', 'string', Rule::in($this->allowedRoles())],
        ]);

        // Only a super_admin may grant the super_admin role.
        if ($data['role'] === 'super_admin' && ! $actor->isSuperAdmin()) {
            abort(403, __('messages.only_super_admin_can_grant_super_admin'));
        }

        // Agency admins can only manage users within their own agency. The
        // actor's scope is driven by the active profile; the target must
        // hold a profile in that same agency (multi-agency targets resolve
        // to their first profile via the legacy accessor, which would mask
        // legitimate cross-agency role grants — `isAgentAt`/`isOwnerAt` is
        // the authoritative membership test post-TCK-142).
        $actorAgencyId = request()?->activeProfile()?->agency_id ?? $actor->agency_id;
        if (! $actor->isSuperAdmin()) {
            if ($actorAgencyId === null
                || (! $user->isAgentAt($actorAgencyId) && ! $user->isOwnerAt($actorAgencyId))
            ) {
                abort(403);
            }
        }

        // Resolve the team context for the assignment. `super_admin` is a
        // cross-tenant role and must stay bound to team_id = null (matches
        // how the seeder + BaseTestCase register it). Scoping it to an
        // agency would create a duplicate role row in the registry.
        $registrar = app(PermissionRegistrar::class);
        $teamId = $data['role'] === 'super_admin' ? null : $actorAgencyId;
        $registrar->setPermissionsTeamId($teamId);

        // Ensure the role exists in the target team context under the `web`
        // guard (matches RolesAndPermissionsSeeder). Without pinning the
        // guard, spatie defaults to the current request guard — `sanctum`
        // inside `auth:sanctum` routes — and creates a ghost duplicate role
        // every call, fragmenting the role registry.
        Role::findOrCreate($data['role'], 'web');

        // Replace all roles with the single new one.
        $user->syncRoles([$data['role']]);

        return $this->json([
            'data' => [
                'id' => $user->id,
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
