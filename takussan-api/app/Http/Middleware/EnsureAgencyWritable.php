<?php

namespace App\Http\Middleware;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
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

        return $next($request);
    }
}
