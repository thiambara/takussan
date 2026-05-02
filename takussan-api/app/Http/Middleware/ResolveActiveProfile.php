<?php

namespace App\Http\Middleware;

use App\Services\Profiles\ActiveProfileResolver;
use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Spatie\Permission\PermissionRegistrar;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * Resolves the **active profile** for the authenticated request and locks the
 * Spatie team context to that profile's agency. Resolution order:
 *
 *   1. Explicit signal — `X-Profile-Id` header or `?profile_id` query.
 *      A value that doesn't match a profile owned by the user → 403.
 *   2. Cookie `active_profile_id` — silently ignored if invalid (the user
 *      may have lost a profile since the cookie was issued).
 *   3. Auto-bascule — if the user owns exactly one profile, pick it.
 *   4. None — pure admins (no profile) keep `team_id = null`; agency-
 *      scoped roles simply won't resolve.
 *
 * Stored on the request so downstream code can call `$request->activeProfile()`
 * and `$request->user()->activeProfile()` without re-resolving.
 *
 * **Coexistence with `SetPermissionsTeamIdMiddleware`** during TCK-141 → -142:
 * the legacy middleware runs earlier in the api group and sets a fallback
 * `team_id` from `users.agency_id`. This middleware overrides that team_id
 * only when a profile is actually resolved. Once `users.agency_id` is dropped
 * (TCK-142), the legacy middleware can be removed.
 */
class ResolveActiveProfile
{
    public function __construct(private readonly ActiveProfileResolver $resolver) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user && $request->bearerToken()) {
            try {
                $user = $request->user('sanctum');
            } catch (AuthenticationException) {
                $user = null;
            }
        }

        if (! $user) {
            return $next($request);
        }

        $explicit = $request->header('X-Profile-Id') ?? $request->query('profile_id');
        if ($explicit !== null && $explicit !== '') {
            $profile = $this->resolver->resolve((string) $explicit, $user);
            if ($profile === null) {
                throw new AccessDeniedHttpException('Profile not accessible.');
            }
            $this->bind($request, $user, $profile);

            return $next($request);
        }

        $cookie = $request->cookie('active_profile_id');
        if (is_string($cookie) && $cookie !== '') {
            $profile = $this->resolver->resolve($cookie, $user);
            if ($profile !== null) {
                $this->bind($request, $user, $profile);

                return $next($request);
            }
        }

        $profiles = $user->profiles();
        if ($profiles->count() === 1) {
            $this->bind($request, $user, $profiles->first());
        }

        return $next($request);
    }

    private function bind(Request $request, $user, $profile): void
    {
        $request->attributes->set('active_profile', $profile);

        $agencyId = $profile->agency_id ?? null;
        $registrar = app(PermissionRegistrar::class);
        $registrar->setPermissionsTeamId($agencyId);
        $user->unsetRelation('roles');
    }
}
