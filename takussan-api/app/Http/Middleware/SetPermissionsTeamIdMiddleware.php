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
 *
 * `super_admin` is a cross-tenant role — its pivot is stored with a null
 * `agency_id`. To detect it before locking the team context to the user's
 * agency, we probe under a null context first; if the user is super_admin the
 * context stays null so `hasRole('super_admin')` keeps resolving downstream.
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
            $registrar = app(PermissionRegistrar::class);

            // Probe cross-tenant role under null team context; the `roles`
            // relation will be re-queried after the team id is finalized.
            $registrar->setPermissionsTeamId(null);
            $user->unsetRelation('roles');
            $isSuperAdmin = $user->hasRole('super_admin');
            $user->unsetRelation('roles');

            $registrar->setPermissionsTeamId($isSuperAdmin ? null : $user->agency_id);
        }

        return $next($request);
    }
}
