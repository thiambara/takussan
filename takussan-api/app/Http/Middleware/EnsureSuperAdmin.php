<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
 * The team-null probe lives on `User::isSuperAdmin()` so every consumer
 * gets the same correct semantic — `ResolveActiveProfile` can pin team_id
 * to an agency for a super_admin who also holds an agency-scoped profile,
 * and the global role assignment is always at `team_id = null`.
 */
class EnsureSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            return new JsonResponse(['message' => 'Unauthenticated.'], 401);
        }

        if (! $user->isSuperAdmin()) {
            return new JsonResponse(['message' => 'Super-admin access required.'], 403);
        }

        return $next($request);
    }
}
