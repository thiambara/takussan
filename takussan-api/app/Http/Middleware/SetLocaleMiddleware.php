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

        // 1. Authenticated user's preferred_language
        if ($request->user() && $request->user()->preferred_language) {
            $locale = $request->user()->preferred_language;
        }

        // 2. Accept-Language header override
        $headerLocale = $request->header('Accept-Language');
        if ($headerLocale) {
            $short = substr($headerLocale, 0, 2);
            if (in_array($short, $this->supportedLocales, true)) {
                $locale = $short;
            }
        }

        // 3. Query parameter override
        if ($request->has('lang') && in_array($request->input('lang'), $this->supportedLocales, true)) {
            $locale = $request->input('lang');
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
}
