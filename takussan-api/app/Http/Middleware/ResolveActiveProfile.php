<?php

namespace App\Http\Middleware;

use App\Services\Profiles\ActiveProfileResolver;
use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * Resolves the **active profile** for the authenticated request. Resolution
 * order:
 *
 *   1. Explicit signal — `X-Profile-Id` header or `?profile_id` query.
 *      A value that doesn't match a profile owned by the user → 403.
 *   2. Soft hint — `X-Active-Profile-Hint` header. Silently ignored if
 *      invalid. Used by SSR fetchers that forward the browser-bound
 *      `active_profile_id` cookie value as a header.
 *   3. Cookie `active_profile_id` — silently ignored if invalid.
 *   4. Auto-bascule — if the user holds profiles in exactly one agency, pick
 *      one. Multi-agence : no auto-bascule (security explicit).
 *   5. None — super_admins (PlatformProfile) work without an agency profile ;
 *      agency-scoped checks simply won't resolve.
 *
 * Stored on the request so downstream code can call `$request->activeProfile()`
 * and `$request->user()->activeProfile()` without re-resolving.
 *
 * TCK-278 — Post-cutover, ce middleware ne touche plus à spatie. L'autorisation
 * passe par les profils (`canActAt` / `isXxxAt`).
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

            // Propagate the Sanctum-resolved user to the default guard so
            // `$request->user()` (and `auth()->user()`) return it for the
            // rest of the request, even on routes that aren't wrapped in
            // `auth:sanctum` (eg. public optional-auth endpoints like the
            // property visit-request / review-eligibility / contact-lead).
            // Without this, the controller sees an anonymous request and
            // enforces the guest validation rules (TCK-179).
            if ($user !== null) {
                Auth::setUser($user);
            }
        }

        if (! $user) {
            return $next($request);
        }

        // TCK-278 — Probe super_admin via `User::isSuperAdmin()` (PlatformProfile).
        if ($user->isSuperAdmin()) {
            // Stay at team_id = null. Explicit profile signals still apply
            // for super_admins acting on behalf of a specific agency, but
            // the auto-bascule and cookie paths below are skipped.
            $explicit = $request->header('X-Profile-Id') ?? $request->query('profile_id');
            if ($explicit !== null && $explicit !== '') {
                $profile = $this->resolver->resolve((string) $explicit, $user);
                if ($profile === null) {
                    throw new AccessDeniedHttpException('Profile not accessible.');
                }
                $this->bind($request, $user, $profile);

                return $next($request);
            }

            $hint = $request->header('X-Active-Profile-Hint');
            if (is_string($hint) && $hint !== '') {
                $profile = $this->resolver->resolve($hint, $user);
                if ($profile !== null) {
                    $this->bind($request, $user, $profile);
                }
            }

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

        $hint = $request->header('X-Active-Profile-Hint');
        if (is_string($hint) && $hint !== '') {
            $profile = $this->resolver->resolve($hint, $user);
            if ($profile !== null) {
                $this->bind($request, $user, $profile);

                return $next($request);
            }
        }

        $cookie = $request->cookie('active_profile_id');
        if (is_string($cookie) && $cookie !== '') {
            $profile = $this->resolver->resolve($cookie, $user);
            if ($profile !== null) {
                $this->bind($request, $user, $profile);

                return $next($request);
            }
        }

        // TCK-278 — Auto-bascule : tolère plusieurs profils dans la même
        // agence (multi-rôles agent+owner) ; multi-agences reste sans
        // auto-bascule (sécurité explicite, le user doit choisir).
        $profiles = $user->profiles();
        if ($profiles->isNotEmpty()) {
            $agencyIds = $profiles
                ->map(fn ($p) => $p->agency_id ?? null)
                ->filter()
                ->unique()
                ->values();

            if ($agencyIds->count() === 1) {
                $this->bind($request, $user, $profiles->first());
            }
        }

        return $next($request);
    }

    private function bind(Request $request, $user, $profile): void
    {
        $request->attributes->set('active_profile', $profile);
        // TCK-278 — Plus de team context spatie.
    }
}
