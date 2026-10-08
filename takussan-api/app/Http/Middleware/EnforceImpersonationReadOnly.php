<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\Admin\ImpersonationService;
use App\Support\ImpersonationContext;
use App\Support\Security\ProtectedActions;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-600 (ADR-0055 §3) — une session d'impersonation LIT, elle n'écrit jamais.
 *
 * Groupe `api`, après `ResolveActiveProfile`. Quand le jeton de la requête appartient à une session
 * ouverte, lie {@see ImpersonationContext} (lu par `Activity::creating`) puis refuse en
 * **403 `impersonation.read_only`** :
 *  - toute méthode autre que `GET` / `HEAD` / `OPTIONS` — aucune écriture permise ;
 *  - les lectures nommées par l'ADR : `/api/admin/*` entier, les téléchargements d'export, toute la
 *    famille 2FA (codes de secours, et le QR de la graine TOTP en cours d'enrôlement ou de
 *    renouvellement — verif-600 M1), les liens de partage d'un document (leur `token` ouvre le
 *    fichier sans session, bien après les 15 minutes), et toute action de la liste step-up (le jeton
 *    n'a jamais de confirmation 2FA : `RequireRecentTwoFactor` les refuserait aussi, mais ce
 *    refus-ci ne dépend pas de cet autre).
 *
 * Relevé des autres lectures GET (verif-600 M1) : `auth/sessions` ne rend ni jeton ni secret (noms,
 * dates), `me/calendar-feed` ne rend pas le lien `.ics` (seule sa création le rend, en POST),
 * `integrations` cache `credentials`, `invitations` ne rend pas son `token`.
 *
 * Le contexte est remis à zéro en entrée ET en sortie : un singleton de portée n'est vidé qu'entre
 * deux jobs ou sous Octane, jamais entre deux requêtes d'un même processus.
 */
class EnforceImpersonationReadOnly
{
    /**
     * CONSIGNE (verif-600 m-D) : toute route GET qui rend un SECRET DURABLE — un jeton, une URL
     * secrète, une graine, un lien qui ouvre sans session — entre ici, le jour où elle est créée.
     * Rien d'autre ne l'attrape : une lecture neuve qui rend un secret ne casse aucun test, et la
     * session repart avec ce qu'elle a lu bien après ses 15 minutes (ADR-0055 §3).
     */
    public const REFUSED_READS = [
        'api/admin',
        'api/admin/*',
        'api/me/data-exports*',
        'api/data-exports/*',
        'api/export/*',
        'api/activity-logs/export*',
        'api/auth/two-factor*',
        'api/documents/*/share-links*',
        // TCK-293 (ADR-0046) — l'URL de webhook porte le jeton qui route les paiements de l'agence.
        'api/integrations/*/webhook-endpoint',
    ];

    public function __construct(
        private readonly ImpersonationContext $context,
        private readonly ImpersonationService $impersonation,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $this->context->clear();

        $token = $this->impersonationToken($request);
        if ($token === null) {
            return $next($request);
        }

        $session = $this->impersonation->openSessionForToken($token);
        if ($session !== null) {
            $this->context->bind((int) $session->id, (int) $session->impersonator_id);
        }

        $action = $request->route()?->getActionName();
        if (! $request->isMethodSafe()
            || $request->is(...self::REFUSED_READS)
            || ProtectedActions::requiresStepUp($action)
            || ProtectedActions::requiresStepUpForPlatform($action)) {
            abort_code(403, 'impersonation.read_only');
        }

        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        $this->context->clear();
    }

    private function impersonationToken(Request $request): ?PersonalAccessToken
    {
        if ($request->bearerToken() === null) {
            return null;
        }

        $user = $request->user('sanctum');
        $token = $user instanceof User ? $user->currentAccessToken() : null;

        return $token instanceof PersonalAccessToken && ImpersonationService::isImpersonationToken($token)
            ? $token
            : null;
    }
}
