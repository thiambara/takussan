<?php

namespace App\Http\Middleware;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Enums\AgencyStatus;
use App\Models\MaintenanceRequest;
use App\Services\Membership\MembershipCapabilityResolver;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-600 (ADR-0048 §3) — une agence suspendue se lit, elle ne s'écrit plus.
 *
 * Groupe `api`, après `ResolveActiveProfile` : une méthode non sûre sous un profil actif d'une
 * agence `suspended` rend **423 `agency.suspended`**. Le verrou ne vaut que pour `suspended` :
 * une agence `inactive` doit pouvoir se remettre en conformité.
 *
 * Liste blanche NOMMÉE — ce qui sert la personne et non l'agence : son authentification
 * (`api/auth/*`), son compte, ses exports et sa demande d'effacement (`api/me/*`), ses
 * notifications (`api/notifications/*`). Les exports de données de l'agence sont des lectures.
 *
 * Second chemin : {@see MembershipCapabilityResolver} refuse les
 * capacités d'écriture dans une agence suspendue, quel que soit le profil actif.
 *
 * verif-600 O2 — le prestataire assigné n'a pas de profil d'agence : pour lui, le verrou se juge
 * sur l'agence de l'INTERVENTION visée ({@see MaintenanceRequest::lockedForProvider()}) — la
 * demande elle-même et le message posté sur son fil. L'ajout d'une pièce par `POST /api/media`
 * (cible dans le corps) est jugé par `MediaController::authorizeAttach()` ; retirer une pièce
 * d'intervention ne lui est ouvert dans aucun état (`MediaPolicy::delete`).
 */
class EnsureAgencyWritable
{
    public const WHITELIST = ['api/auth/*', 'api/me', 'api/me/*', 'api/notifications', 'api/notifications/*'];

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->isMethodSafe() || $request->is(...self::WHITELIST)) {
            return $next($request);
        }

        $agencyId = $request->activeProfile()?->agency_id ?? null;
        if ($agencyId !== null
            && Agency::query()->whereKey($agencyId)->where('status', AgencyStatus::Suspended)->exists()) {
            abort_code(423, 'agency.suspended');
        }

        $user = $request->user();
        if ($user !== null && $this->interventionVisee($request)?->lockedForProvider($user) === true) {
            abort_code(423, 'agency.suspended');
        }

        return $next($request);
    }

    /**
     * L'intervention qu'écrit la requête, quand la route la désigne. Sur son fil, seul le MESSAGE
     * est un travail pour l'agence : marquer lu, mettre en sourdine ou archiver restent à la
     * personne (ADR-0048 §3).
     */
    private function interventionVisee(Request $request): ?MaintenanceRequest
    {
        $route = $request->route();
        if ($route === null) {
            return null;
        }

        $cible = $route->parameter('maintenanceRequest');
        if ($cible instanceof MaintenanceRequest) {
            return $cible;
        }

        $fil = $route->parameter('conversation');
        if ($fil instanceof Conversation && $fil->maintenance_request_id !== null
            && $request->routeIs('conversations.messages.store')) {
            return $fil->maintenanceRequest;
        }

        return null;
    }
}
