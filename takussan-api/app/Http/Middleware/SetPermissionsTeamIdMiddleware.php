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
        // The default guard is session-based; API requests authenticate via
        // sanctum tokens, so we resolve both.
        $user = $request->user() ?? $request->user('sanctum');

        if ($user) {
            app(PermissionRegistrar::class)->setPermissionsTeamId($user->agency_id);
        }

        return $next($request);
    }
}
