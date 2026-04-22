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
            $actor->hasRole('super_admin') || $actor->hasRole(['admin', 'agency_admin']),
            403,
        );

        $data = $request->validate([
            'role' => ['required', 'string', Rule::in($this->allowedRoles())],
        ]);

        // Only a super_admin may grant the super_admin role.
        if ($data['role'] === 'super_admin' && ! $actor->hasRole('super_admin')) {
            abort(403, __('messages.only_super_admin_can_grant_super_admin'));
        }

        // Agency admins can only manage users within their own agency.
        if (
            ! $actor->hasRole('super_admin')
            && $user->agency_id !== null
            && $user->agency_id !== $actor->agency_id
        ) {
            abort(403);
        }

        // Ensure role exists in the user's team context (spatie teams=true).
        $registrar = app(PermissionRegistrar::class);
        $registrar->setPermissionsTeamId($user->agency_id);
        Role::findOrCreate($data['role']);

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
