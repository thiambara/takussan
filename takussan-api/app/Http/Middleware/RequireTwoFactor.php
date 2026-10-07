<?php

namespace App\Http\Middleware;

use App\Models\Agency;
use App\Models\User;
use App\Services\Auth\AuthRefusal;
use App\Support\Security\ProtectedActions;
use App\Support\Security\TwoFactorRequirement;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-589 — la 2FA EXIGÉE (ADR-0033, contrainte 7). Plus strict, jamais moins :
 *
 *  1. un compte portant `metadata.force_2fa_reconfigure` (réinitialisation par le
 *     support) : 403 `two_factor_required` sur toute route hors `api/auth/*` —
 *     c'est là qu'il se ré-enrôle ;
 *  2. un profil plateforme sans 2FA, sur tout `/api/admin/*` ;
 *  3. sur les actions MUTANTES des familles de {@see ProtectedActions} : tout admin
 *     d'agence sans 2FA, et tout personnel de l'agence quand celle-ci a coché
 *     `settings.require_team_two_factor`. Jamais un bailleur, jamais un client.
 *
 * Aucun délai de grâce, aucun drapeau : l'admin sans 2FA est enrôlé sur place à
 * sa première 403 (le front lit le code).
 *
 * Branché en fin de groupe `api`, donc AVANT `auth:sanctum` : l'utilisateur se lit
 * par la garde `sanctum` explicitement (piège de `SetLocaleMiddleware`). Sans
 * utilisateur, on laisse passer — `auth:sanctum` rend le 401.
 */
class RequireTwoFactor
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user() ?? $request->user('sanctum');
        if (! $user instanceof User || $request->is('api/auth', 'api/auth/*')) {
            return $next($request);
        }

        if (($user->metadata['force_2fa_reconfigure'] ?? false) === true) {
            return $this->refuse();
        }

        if ($user->two_factor_enabled) {
            return $next($request);
        }

        if ($request->is('api/admin', 'api/admin/*') && $user->platformProfile()->exists()) {
            return $this->refuse();
        }

        if (! $request->isMethodSafe()
            && ProtectedActions::requiresAgencyTwoFactor($request->route()?->getActionName())
            && TwoFactorRequirement::requiredAtAgency($user, $this->requestAgencyId($request))) {
            return $this->refuse();
        }

        return $next($request);
    }

    /** L'agence que vise la requête : `{agency}` de la route, sinon le profil actif. */
    private function requestAgencyId(Request $request): ?int
    {
        $agency = $request->route('agency');
        if ($agency instanceof Agency) {
            return (int) $agency->getKey();
        }
        if (is_numeric($agency)) {
            return (int) $agency;
        }

        $agencyId = $request->activeProfile()?->agency_id;

        return $agencyId !== null ? (int) $agencyId : null;
    }

    private function refuse(): Response
    {
        return AuthRefusal::response(403, 'two_factor_required', 'auth.two_factor.required');
    }
}
