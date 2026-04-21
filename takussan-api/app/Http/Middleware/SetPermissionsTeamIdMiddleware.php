<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Spatie\Permission\PermissionRegistrar;
use Symfony\Component\HttpFoundation\Response;

/**
 * Sets the Spatie Permission team context to the authenticated user's agency.
 *
 * Spatie Permission is configured in teams mode with `team_foreign_key =
 * agency_id`. Role lookups (`getRoleNames`, `hasRole`, etc.) filter on the
 * current team context; without this middleware the context is null and
 * agency-scoped role assignments resolve to an empty set.
 */
class SetPermissionsTeamIdMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        // Default guard is session-based; API callers authenticate via sanctum
        // tokens. Only invoke the sanctum guard when a bearer token is actually
        // present so unauthenticated endpoints don't pay for a token lookup.
        $user = $request->user();
        if (! $user && $request->bearerToken()) {
            $user = $request->user('sanctum');
        }

        if ($user) {
            app(PermissionRegistrar::class)->setPermissionsTeamId($user->agency_id);
        }

        return $next($request);
    }
}
