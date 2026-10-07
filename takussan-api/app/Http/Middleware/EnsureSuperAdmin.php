<?php

namespace App\Http\Middleware;

use App\Services\Auth\AuthRefusal;
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

        // TCK-589 — la console plateforme exige la 2FA (ADR-0033, contrainte 7).
        // Redondant avec `RequireTwoFactor` sur `/api/admin/*` : ce bloc tient même
        // si la route quitte un jour ce préfixe.
        if (! $user->two_factor_enabled) {
            return AuthRefusal::response(403, 'two_factor_required', 'auth.two_factor.required');
        }

        return $next($request);
    }
}
