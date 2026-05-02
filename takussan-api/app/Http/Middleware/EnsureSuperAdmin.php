<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\PermissionRegistrar;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gate for the `/api/admin/*` namespace (TCK-144). Requires a Sanctum-
 * authenticated user holding the `super_admin` role under `team_id = null`
 * (global). Returns:
 *
 *   - 401 if no authenticated user
 *   - 403 if authenticated but not super_admin
 *   - next() otherwise
 *
 * Probes the role under a null team explicitly because `ResolveActiveProfile`
 * may have pinned `team_id` to an agency for a super_admin who also holds an
 * agency-scoped profile (e.g., they used `X-Profile-Id` to act inside an
 * agency). The global role assignment is always at `team_id = null`.
 */
class EnsureSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            return new JsonResponse(['message' => 'Unauthenticated.'], 401);
        }

        $registrar = app(PermissionRegistrar::class);
        $previousTeamId = $registrar->getPermissionsTeamId();
        $registrar->setPermissionsTeamId(null);
        $user->unsetRelation('roles');
        $isSuperAdmin = $user->hasRole('super_admin');
        $user->unsetRelation('roles');
        $registrar->setPermissionsTeamId($previousTeamId);

        if (! $isSuperAdmin) {
            return new JsonResponse(['message' => 'Super-admin access required.'], 403);
        }

        return $next($request);
    }
}
