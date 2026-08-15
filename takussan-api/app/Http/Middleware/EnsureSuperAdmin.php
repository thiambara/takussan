<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gate for the `/api/admin/*` namespace (TCK-144). Requires a Sanctum-
 * authenticated user holding an active super_admin `PlatformProfile`
 * (TCK-278). Returns:
 *
 *   - 401 if no authenticated user
 *   - 403 if authenticated but not super_admin
 *   - next() otherwise
 *
 * The probe lives on `User::isSuperAdmin()` (backed by
 * `hasActiveSuperAdminProfile()`) so every consumer gets the same correct
 * semantic — `ResolveActiveProfile` can still pin an active agency profile
 * for a super_admin who also holds an agency-scoped profile.
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
