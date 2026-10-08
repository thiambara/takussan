<?php

namespace App\Http\Middleware;

use App\Services\Auth\AuthRefusal;
use App\Support\Security\TwoFactorSession;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gate for the `/api/admin/*` namespace (TCK-144). Requires a Sanctum-
 * authenticated user holding an active `PlatformProfile` (TCK-278). Returns:
 *
 *   - 401 if no authenticated user
 *   - 403 if authenticated but holds no active platform profile
 *   - 403 if the route declares no platform ability and the caller is not
 *     `super_admin` — TCK-600 (ADR-0047) : the REFUSAL BY DEFAULT
 *   - next() otherwise
 *
 * TCK-600 (ADR-0047) — l'ENTRÉE est ouverte à tout niveau (`support`, `viewer`), mais une route
 * n'est ouverte à un niveau inférieur que si elle déclare un geste par `platform-can:<geste>`
 * ({@see EnsurePlatformAbility}, qui juge ce geste). Une route qui n'en déclare aucun reste au
 * `super_admin` : élargir le prédicat d'entrée n'ouvre rien par omission.
 *
 * The probe lives on `User::hasActivePlatformProfile()` / `isSuperAdmin()` so every consumer gets
 * the same semantic — `ResolveActiveProfile` can still pin an active agency profile for an
 * operator who also holds an agency-scoped profile.
 */
class EnsureSuperAdmin
{
    public const ABILITY_MIDDLEWARE = 'platform-can:';

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            abort_code(401, 'auth.unauthenticated');
        }

        if (! $user->hasActivePlatformProfile()) {
            abort_code(403, 'auth.super_admin_required');
        }

        // TCK-589 — la console plateforme exige la 2FA (ADR-0033, contrainte 7), à TOUS les
        // niveaux (TCK-600). Redondant avec `RequireTwoFactor` sur `/api/admin/*` : ce bloc tient
        // même si la route quitte un jour ce préfixe.
        if (! $user->two_factor_enabled) {
            return AuthRefusal::response(403, 'two_factor_required', 'auth.two_factor.required');
        }
        // Vérification adverse B2 — et saisie POUR CE JETON : un jeton émis sans second
        // facteur (OAuth) n'ouvre pas la console, même d'un compte à 2FA.
        if (! TwoFactorSession::verified($user)) {
            return AuthRefusal::response(403, 'two_factor_step_up_required', 'auth.two_factor.step_up_required');
        }

        // TCK-600 — refus par défaut : sans geste déclaré, la route est au `super_admin`.
        if (! self::declaresAbility($request) && ! $user->isSuperAdmin()) {
            abort_code(403, 'auth.super_admin_required');
        }

        return $next($request);
    }

    public static function declaresAbility(Request $request): bool
    {
        foreach ($request->route()?->gatherMiddleware() ?? [] as $middleware) {
            if (is_string($middleware) && str_starts_with($middleware, self::ABILITY_MIDDLEWARE)) {
                return true;
            }
        }

        return false;
    }
}
