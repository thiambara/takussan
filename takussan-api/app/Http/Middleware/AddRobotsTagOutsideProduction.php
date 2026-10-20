<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-926 (P34.05) — hors de la production, toute réponse de l'API porte
 * `X-Robots-Tag: noindex, nofollow`.
 *
 * `public/robots.txt` vaut `Disallow:` (tout permis), et `/` rend la vue `welcome` en HTML : rien
 * ne tenait un moteur hors de l'index de la préproduction, que l'authentification basique de
 * Dokploy, hors du dépôt. Un en-tête, et non `Disallow: /` : un moteur qui ne peut pas charger une
 * URL ne lit jamais son `noindex`.
 *
 * L'environnement se reconnaît à son origine, celle d'`APP_URL`, et non à `APP_ENV`, qu'un onglet
 * Dokploy pose à la main (la préproduction est en `staging`, relevé du 2026-10-20 ; ce docblock la
 * disait en `production`). Aucune variable neuve, donc rien à poser.
 * {@see PRODUCTION_ORIGIN} est l'`APP_URL` de l'API de production du plan de bascule (F3, étape 1,
 * `docs/plans/2026-09-13-auto-hebergement-vps-dokploy.md`).
 *
 * Global (`bootstrap/app.php`) : il couvre `api/*`, les routes `web` et les réponses d'erreur.
 */
class AddRobotsTagOutsideProduction
{
    public const PRODUCTION_ORIGIN = 'https://api.takussan.com';

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! self::isProduction((string) config('app.url'))) {
            $response->headers->set('X-Robots-Tag', 'noindex, nofollow');
        }

        return $response;
    }

    /** L'origine d'une URL (schéma, hôte, port), comparée sans casse ni chemin. */
    public static function isProduction(string $appUrl): bool
    {
        return self::origin($appUrl) === self::origin(self::PRODUCTION_ORIGIN);
    }

    private static function origin(string $url): ?string
    {
        $parts = parse_url(trim($url));
        if (! is_array($parts) || ! isset($parts['scheme'], $parts['host'])) {
            return null;
        }

        return strtolower($parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : ''));
    }
}
