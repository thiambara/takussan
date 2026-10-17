<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-774 (P14.12) — tout journal écrit pendant une requête de l'API porte `request_id`, l'agence et
 * le profil actifs. Sans eux, une erreur ne se reliait ni à sa requête ni à une agence.
 *
 * Placé juste après `ResolveActiveProfile`, qui pose le profil actif. Un `X-Request-Id` entrant est
 * repris s'il est un jeton court et sûr (celui d'un proxy en amont) ; sinon un UUID est tiré. Rien
 * d'autre n'entre : ni l'utilisateur, ni une donnée de la requête.
 */
class ShareRequestLogContext
{
    private const INCOMING_ID = '/^[A-Za-z0-9._-]{1,64}$/';

    public function handle(Request $request, Closure $next): Response
    {
        $incoming = (string) $request->headers->get('X-Request-Id', '');
        $profile = $request->activeProfile();

        Log::withContext([
            'request_id' => preg_match(self::INCOMING_ID, $incoming) === 1 ? $incoming : (string) Str::uuid(),
            'agency_id' => $profile?->agency_id,
            'profile_type' => $profile !== null ? class_basename($profile) : null,
            'profile_id' => $profile?->getKey(),
        ]);

        return $next($request);
    }
}
