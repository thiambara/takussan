<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Support\AgencyKindGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * TCK-135 — agency-scoped role editor exposed at `/api/roles`.
 *
 * `index` returns predefined (team_id=null) AND custom (team_id=current
 * agency) roles in a single response so the editor can present the full
 * picture without two round-trips. Mutations (`store`, `update`,
 * `destroy`, `attachPermission`, `detachPermission`) only apply to
 * custom roles in the actor's active agency. Predefined roles are
 * returned read-only and any attempt to mutate them is rejected at the
 * controller level (not by relying on the FK alone).
 */
class RoleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyId($request);
        abort_unless($agencyId !== null, 403);
        AgencyKindGuard::ensureStandardForNonGlobal($request->user(), $agencyId);

        $scope = $request->input('filter.scope');
        $teamsKey = app(PermissionRegistrar::class)->teamsKey;

        $query = Role::query()
            ->select(['id', 'name', 'guard_name', $teamsKey])
            ->where('guard_name', 'web');

        if ($scope === 'global') {
            $query->whereNull($teamsKey);
        } elseif ($scope === 'agency') {
            $query->where($teamsKey, $agencyId);
        } else {
            $query->where(function ($q) use ($agencyId, $teamsKey) {
                $q->whereNull($teamsKey)->orWhere($teamsKey, $agencyId);
            });
        }

        $includes = explode(',', (string) $request->query('include', ''));
        if (in_array('permissions', $includes, true)) {
            $query->with('permissions:id,name');
        }

        $roles = $query->orderBy($teamsKey)->orderBy('name')->get();

        return $this->json([
            'data' => $roles->map(fn (Role $role) => $this->present($role, in_array('permissions', $includes, true)))->all(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $agencyId = $this->resolveAgencyId($request);
        $this->authorizeAgencyManager($request, $agencyId);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100', 'regex:/^[a-z0-9_]+$/'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
        ], [
            'name.regex' => 'Le nom doit contenir uniquement des minuscules, chiffres et underscores.',
        ]);

        $teamsKey = app(PermissionRegistrar::class)->teamsKey;

        // Reject collisions with predefined role names so a custom
        // `agent` can't shadow the global one in this team's lookups.
        $predefinedExists = Role::query()
            ->whereNull($teamsKey)
            ->where('name', $data['name'])
            ->exists();
        abort_if($predefinedExists, 422, 'Ce nom est réservé à un rôle prédéfini.');

        app(PermissionRegistrar::class)->setPermissionsTeamId($agencyId);

        $role = Role::create([
            'name' => $data['name'],
            'guard_name' => 'web',
            $teamsKey => $agencyId,
        ]);

        if (! empty($data['permissions'])) {
            $role->syncPermissions($data['permissions']);
        }

        $role->load('permissions:id,name');

        return $this->json(['data' => $this->present($role, true)], 201);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        $agencyId = $this->resolveAgencyId($request);
        $this->authorizeAgencyManager($request, $agencyId);
        $this->ensureCustomRoleInAgency($role, $agencyId);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:100', 'regex:/^[a-z0-9_]+$/'],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
        ]);

        if (isset($data['name']) && $data['name'] !== $role->name) {
            $teamsKey = app(PermissionRegistrar::class)->teamsKey;
            $predefinedExists = Role::query()
                ->whereNull($teamsKey)
                ->where('name', $data['name'])
                ->exists();
            abort_if($predefinedExists, 422, 'Ce nom est réservé à un rôle prédéfini.');
            $role->update(['name' => $data['name']]);
        }

        if (isset($data['permissions'])) {
            app(PermissionRegistrar::class)->setPermissionsTeamId($agencyId);
            $role->syncPermissions($data['permissions']);
        }

        $role->refresh()->load('permissions:id,name');

        return $this->json(['data' => $this->present($role, true)]);
    }

    public function destroy(Request $request, Role $role): JsonResponse
    {
        $agencyId = $this->resolveAgencyId($request);
        $this->authorizeAgencyManager($request, $agencyId);
        $this->ensureCustomRoleInAgency($role, $agencyId);

        // Block deletion if the role is currently assigned to any user
        // in the same team — prevents silently revoking permissions for
        // active members. The frontend surfaces the 422 message.
        $usersCount = $role->users()->count();
        abort_if(
            $usersCount > 0,
            422,
            __('Impossible de supprimer ce rôle : il est attribué à :count utilisateur(s).', ['count' => $usersCount]),
        );

        $role->delete();

        return $this->json(null, 204);
    }

    public function attachPermission(Request $request, Role $role): JsonResponse
    {
        $agencyId = $this->resolveAgencyId($request);
        $this->authorizeAgencyManager($request, $agencyId);
        $this->ensureCustomRoleInAgency($role, $agencyId);

        $data = $request->validate([
            'permission' => ['required', 'string', 'exists:permissions,name'],
        ]);

        app(PermissionRegistrar::class)->setPermissionsTeamId($agencyId);
        $role->givePermissionTo($data['permission']);
        $role->refresh()->load('permissions:id,name');

        return $this->json(['data' => $this->present($role, true)]);
    }

    public function detachPermission(Request $request, Role $role, string $permission): JsonResponse
    {
        $agencyId = $this->resolveAgencyId($request);
        $this->authorizeAgencyManager($request, $agencyId);
        $this->ensureCustomRoleInAgency($role, $agencyId);

        $exists = Permission::query()->where('name', $permission)->exists();
        abort_unless($exists, 404);

        app(PermissionRegistrar::class)->setPermissionsTeamId($agencyId);
        $role->revokePermissionTo($permission);
        $role->refresh()->load('permissions:id,name');

        return $this->json(['data' => $this->present($role, true)]);
    }

    /**
     * TCK-141 — prefer the active profile's agency, fall back to the
     * user's legacy agency column until TCK-142 cutover removes it.
     */
    protected function resolveAgencyId(Request $request): ?int
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        return $request->activeProfile()?->agency_id ?? $user->agency_id;
    }

    protected function authorizeAgencyManager(Request $request, ?int $agencyId): void
    {
        $user = $request->user();
        abort_unless($user && $agencyId !== null, 403);

        // super_admin bypass via Gate::before. agency_admin needs the
        // explicit permission resolved under the active team_id.
        if ($user->isSuperAdmin() || $user->hasRole('admin')) {
            return;
        }

        // Custom roles are a Standard-only feature (spec features.md §2.2 —
        // « pas de rôles personnalisés » pour individual).
        AgencyKindGuard::ensureStandardForNonGlobal($user, $agencyId);

        app(PermissionRegistrar::class)->setPermissionsTeamId($agencyId);
        $user->unsetRelation('roles');
        $user->unsetRelation('permissions');

        abort_unless($user->can('roles.manage_in_agency'), 403);
    }

    protected function ensureCustomRoleInAgency(Role $role, ?int $agencyId): void
    {
        // Predefined roles live with team_id=null and must never be
        // mutated through this controller.
        $teamsKey = app(PermissionRegistrar::class)->teamsKey;
        $roleTeam = $role->{$teamsKey};
        abort_if($roleTeam === null, 403, 'Les rôles prédéfinis ne sont pas modifiables.');
        abort_if((int) $roleTeam !== (int) $agencyId, 403);
    }

    /**
     * @return array<string,mixed>
     */
    protected function present(Role $role, bool $withPermissions): array
    {
        $teamsKey = app(PermissionRegistrar::class)->teamsKey;
        $roleTeam = $role->{$teamsKey};

        $payload = [
            'id' => $role->id,
            'name' => $role->name,
            'guard_name' => $role->guard_name,
            'team_id' => $roleTeam,
            'scope' => $roleTeam === null ? 'global' : 'agency',
            'is_predefined' => $roleTeam === null,
        ];

        if ($withPermissions) {
            $payload['permissions'] = $role->permissions
                ->map(fn ($p) => ['id' => $p->id, 'name' => $p->name])
                ->values()
                ->all();
        }

        return $payload;
    }
}
