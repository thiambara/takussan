<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetLocaleMiddleware
{
    /** @var list<string> */
    protected array $supportedLocales = ['fr', 'en', 'wo'];

    /**
     * Ordre de résolution (TCK-536) : `?lang=` → `Accept-Language` → `preferred_language` → défaut.
     *
     * L'en-tête passe AVANT la préférence du compte parce que le front y transmet la langue qu'il
     * AFFICHE — segment d'URL, puis cookie `NEXT_LOCALE` (ADR-0026 §5). La préférence gagnait
     * jusque-là : un compte réglé en `fr` recevait ses erreurs de validation en français sur
     * `/en/properties/x`. Elle reste le repli d'un appelant qui n'envoie aucune langue supportée.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $locale = null;
        $user = $this->resolveUser($request);

        // 1. Explicit query parameter override (useful for debugging / preview).
        if ($request->has('lang') && in_array($request->input('lang'), $this->supportedLocales, true)) {
            $locale = $request->input('lang');
        }

        // 2. Accept-Language header (with q-factor parsing).
        if ($locale === null) {
            $locale = $this->negotiateFromHeader($request->header('Accept-Language'));
        }

        // 3. Authenticated user's preferred_language.
        if ($locale === null && $user && in_array($user->preferred_language, $this->supportedLocales, true)) {
            $locale = $user->preferred_language;
        }

        if ($locale && in_array($locale, $this->supportedLocales, true)) {
            app()->setLocale($locale);
        }

        // Set timezone if user has one configured.
        // ⚠ Délibérément PAS `$user` (TCK-536) : par jeton Bearer, `$request->user()` est `null` ici,
        // et cette ligne n'a donc jamais tourné en production. L'activer déplacerait tout `now()`
        // écrit en base hors d'UTC (`app.timezone`) — c'est une décision à part, pas un correctif.
        if ($request->user() && $request->user()->timezone) {
            date_default_timezone_set($request->user()->timezone);
        }

        return $next($request);
    }

    /**
     * Ce middleware tourne dans le groupe `api`, donc AVANT `auth:sanctum` : la garde par défaut
     * est encore `web`, et `$request->user()` rend `null` pour un appel par jeton Bearer — le cas
     * de toutes les requêtes du front. D'où la garde `sanctum` interrogée explicitement ; elle
     * garde l'utilisateur en mémoire, `auth:sanctum` ne le résout pas une seconde fois.
     * (`Sanctum::actingAs()` bascule la garde par défaut, ce qui masquait le défaut en test.)
     */
    protected function resolveUser(Request $request): ?User
    {
        $user = $request->user() ?? $request->user('sanctum');

        return $user instanceof User ? $user : null;
    }

    /**
     * Parse an Accept-Language header and return the first matching supported
     * locale, honouring q-factor ordering (e.g. "en;q=0.6,fr;q=0.9,wo;q=0.1").
     */
    protected function negotiateFromHeader(?string $header): ?string
    {
        if (! $header) {
            return null;
        }

        $candidates = [];

        foreach (explode(',', $header) as $part) {
            $part = trim($part);
            if ($part === '') {
                continue;
            }

            $q = 1.0;
            if (str_contains($part, ';')) {
                [$tag, $params] = explode(';', $part, 2);
                $tag = trim($tag);

                if (preg_match('/q\s*=\s*([0-9.]+)/i', $params, $m)) {
                    // RFC 7231 §5.3.1: q-factor must be in [0, 1] with up to 3 decimals.
                    // Clamp to defend against malformed values like `q=999` or `q=1.2.3`.
                    $q = max(0.0, min(1.0, (float) $m[1]));
                }
            } else {
                $tag = $part;
            }

            $short = strtolower(substr($tag, 0, 2));
            if ($short !== '' && in_array($short, $this->supportedLocales, true)) {
                // Keep the highest q seen for a given locale.
                if (! isset($candidates[$short]) || $q > $candidates[$short]) {
                    $candidates[$short] = $q;
                }
            }
        }

        if ($candidates === []) {
            return null;
        }

        arsort($candidates);

        return (string) array_key_first($candidates);
    }
}
