<?php

namespace App\Http\Middleware;

use App\Models\Agency;
use App\Models\User;
use App\Services\Auth\AuthRefusal;
use App\Support\Security\ProtectedActions;
use App\Support\Security\TwoFactorRequirement;
use App\Support\Security\TwoFactorSession;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-589 — la 2FA EXIGÉE (ADR-0033, contrainte 7). Plus strict, jamais moins :
 *
 *  1. un compte portant `metadata.force_2fa_reconfigure` (réinitialisation par le
 *     support) : 403 `two_factor_required` sur toute route hors `api/auth/*` —
 *     c'est là qu'il se ré-enrôle ;
 *  2. un profil plateforme sans 2FA, sur tout `/api/admin/*` ET sur toute action mutante
 *     des listes d'agence et de step-up plateforme (B1 : `Gate::before` lui ouvre tout) ;
 *  3. sur les actions MUTANTES des familles de {@see ProtectedActions} : tout admin
 *     d'agence sans 2FA, et tout personnel de l'agence quand celle-ci a coché
 *     `settings.require_team_two_factor`. Jamais un bailleur, jamais un client.
 *
 * « Avoir la 2FA », c'est l'avoir saisie POUR CE JETON ({@see TwoFactorSession}, vérification
 * adverse B2) : un compte à 2FA dont la session ne l'a pas vue reçoit
 * `two_factor_step_up_required`, que le front résout en demandant le TOTP.
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

        // B2 — une session à deux facteurs passe ; tout le reste se juge sur ce que la
        // requête exige. Le compte à 2FA dont CE jeton n'a pas vu le second facteur (entré
        // par OAuth, jeton d'avant l'enrôlement…) est refusé comme le compte sans 2FA, avec
        // le code qui le résout sur place : saisir son TOTP (step-up) sur ce jeton.
        if ($user->two_factor_enabled && TwoFactorSession::verified($user)) {
            return $next($request);
        }

        return $this->requiresTwoFactor($request, $user) ? $this->refuse($user) : $next($request);
    }

    private function requiresTwoFactor(Request $request, User $user): bool
    {
        $plateforme = $user->platformProfile()->exists();
        if ($request->is('api/admin', 'api/admin/*') && $plateforme) {
            return true;
        }

        // Vérification adverse B1 — `Gate::before` ouvre toute policy au super-admin : hors de
        // `/api/admin/*`, une action protégée (rôles, blocage, reversements…) lui était ouverte
        // sans 2FA. Tout profil plateforme la porte sur TOUTE action listée.
        $action = $request->route()?->getActionName();
        if ($plateforme && ! $request->isMethodSafe()
            && (ProtectedActions::requiresAgencyTwoFactor($action) || ProtectedActions::requiresStepUpForPlatform($action))) {
            return true;
        }

        return ! $request->isMethodSafe()
            && ProtectedActions::requiresAgencyTwoFactor($action)
            && TwoFactorRequirement::requiredAtAgency($user, $this->requestAgencyId($request));
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

    private function refuse(?User $user = null): Response
    {
        return $user?->two_factor_enabled
            ? AuthRefusal::response(403, 'two_factor_step_up_required', 'auth.two_factor.step_up_required')
            : AuthRefusal::response(403, 'two_factor_required', 'auth.two_factor.required');
    }
}
