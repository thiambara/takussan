<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetLocaleMiddleware
{
    /** @var list<string> */
    protected array $supportedLocales = ['fr', 'en', 'wo'];

    public function handle(Request $request, Closure $next): Response
    {
        $locale = null;

        // 1. Explicit query parameter override (useful for debugging / preview).
        if ($request->has('lang') && in_array($request->input('lang'), $this->supportedLocales, true)) {
            $locale = $request->input('lang');
        }

        // 2. Authenticated user's preferred_language wins over header negotiation.
        if ($locale === null && $request->user() && $request->user()->preferred_language) {
            $candidate = $request->user()->preferred_language;
            if (in_array($candidate, $this->supportedLocales, true)) {
                $locale = $candidate;
            }
        }

        // 3. Fallback: Accept-Language header (with q-factor parsing).
        if ($locale === null) {
            $locale = $this->negotiateFromHeader($request->header('Accept-Language'));
        }

        if ($locale && in_array($locale, $this->supportedLocales, true)) {
            app()->setLocale($locale);
        }

        // Set timezone if user has one configured
        if ($request->user() && $request->user()->timezone) {
            date_default_timezone_set($request->user()->timezone);
        }

        return $next($request);
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
