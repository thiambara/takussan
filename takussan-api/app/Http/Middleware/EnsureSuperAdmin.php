<?php

namespace App\Http\Middleware;

use App\Services\Auth\AuthRefusal;
use App\Support\Security\TwoFactorSession;
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
        // Vérification adverse B2 — et saisie POUR CE JETON : un jeton émis sans second
        // facteur (OAuth) n'ouvre pas la console, même d'un compte à 2FA.
        if (! TwoFactorSession::verified($user)) {
            return AuthRefusal::response(403, 'two_factor_step_up_required', 'auth.two_factor.step_up_required');
        }

        return $next($request);
    }
}
