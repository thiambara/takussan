<?php

namespace App\Http\Middleware;

use App\Http\Controllers\Api\Auth\TwoFactorController;
use App\Models\User;
use App\Services\Auth\AuthRefusal;
use App\Services\Auth\SessionTokenIssuer;
use App\Support\Security\ProtectedActions;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-589 — le STEP-UP (ADR-0033, contrainte 9) : sur les actions de
 * {@see ProtectedActions::STEP_UP}, un TOTP saisi il y a moins de 10 min SUR CE
 * JETON (`personal_access_tokens.two_factor_verified_at`). Porté par le jeton et
 * non par l'utilisateur : une autre session du même compte ne l'hérite pas.
 *
 *  - pas de 2FA du tout : 403 `two_factor_required` (on ne peut pas prouver un
 *    second facteur qu'on n'a pas) — sauf sur les codes de secours, où le
 *    contrôleur répond déjà « 2FA non activée » ;
 *  - 2FA, pas de step-up récent : 403 `two_factor_step_up_required`, et le front
 *    ouvre la boîte de code (`POST /auth/two-factor/step-up`) puis rejoue.
 *
 * Même place que {@see RequireTwoFactor} : utilisateur lu par la garde `sanctum`.
 */
class RequireRecentTwoFactor
{
    public function handle(Request $request, Closure $next): Response
    {
        $action = $request->route()?->getActionName();
        $guarded = ProtectedActions::requiresStepUp($action)
            || ProtectedActions::requiresStepUpForPlatform($action);
        if (! $guarded) {
            return $next($request);
        }

        $user = $request->user() ?? $request->user('sanctum');
        if (! $user instanceof User) {
            return $next($request);
        }

        if (! ProtectedActions::requiresStepUp($action) && ! $user->isSuperAdmin()) {
            return $next($request);
        }

        if (! $user->two_factor_enabled) {
            return str_starts_with(ProtectedActions::normalize($action), TwoFactorController::class.'@')
                ? $next($request)
                : AuthRefusal::response(403, 'two_factor_required', 'auth.two_factor.required');
        }

        if (SessionTokenIssuer::stepUpValidUntil($user->currentAccessToken()) === null) {
            return AuthRefusal::response(403, 'two_factor_step_up_required', 'auth.two_factor.step_up_required');
        }

        return $next($request);
    }
}
