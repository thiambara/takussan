<?php

namespace App\Http\Middleware;

use App\Services\Profiles\ActiveProfileResolver;
use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Spatie\Permission\PermissionRegistrar;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * Resolves the **active profile** for the authenticated request and locks the
 * Spatie team context to that profile's agency. Resolution order:
 *
 *   1. Explicit signal — `X-Profile-Id` header or `?profile_id` query.
 *      A value that doesn't match a profile owned by the user → 403.
 *   2. Soft hint — `X-Active-Profile-Hint` header. Mirrors the cookie
 *      semantics: silently ignored if invalid. Used by SSR fetchers that
 *      forward the browser-bound `active_profile_id` cookie value as a
 *      header (the cookie itself isn't transmitted across the Next ↔
 *      Laravel hop). Distinct from `X-Profile-Id` so a deliberate UI
 *      switch keeps its strict semantics.
 *   3. Cookie `active_profile_id` — silently ignored if invalid (the user
 *      may have lost a profile since the cookie was issued).
 *   4. Auto-bascule — if the user owns exactly one profile, pick it.
 *   5. None — pure admins (no profile) keep `team_id = null`; agency-
 *      scoped roles simply won't resolve.
 *
 * Stored on the request so downstream code can call `$request->activeProfile()`
 * and `$request->user()->activeProfile()` without re-resolving.
 *
 * Sole owner of the spatie team context for api requests since TCK-142
 * dropped the legacy column the previous middleware read from.
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

        // TCK-278 — Probe super_admin via la source de vérité unifiée
        // (`User::isSuperAdmin()` qui regarde PlatformProfile puis fallback
        // spatie). Plus de `setPermissionsTeamId` ici : le RBAC ne dépend
        // plus du team context du registrar.
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

        // TCK-278 — Auto-bascule : (a) exactly one profile, ou (b) plusieurs
        // profils mais tous dans la même agence (cas créé par les fixtures
        // de coexistence qui matérialisent à la fois OwnerProfile du shim
        // TCK-142 et le profil canonique du rôle, ou par un user portant
        // légitimement plusieurs rôles dans la même agence — agent+owner).
        // Multi-agences reste sans auto-bascule (sécurité explicite, le
        // user doit choisir).
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

        // TCK-278 — On ne touche plus au team context spatie : l'autorisation
        // passe par les profils (`canActAt` / `isXxxAt`). Le team context
        // restera utile en P2 pour les check spatie résiduels (hasRole) qui
        // disparaîtront au cutover P3.
        $agencyId = $profile->agency_id ?? null;
        if ($agencyId !== null && app()->bound(PermissionRegistrar::class)) {
            try {
                $registrar = app(PermissionRegistrar::class);
                $registrar->setPermissionsTeamId($agencyId);
                $user->unsetRelation('roles');
            } catch (\Throwable) {
                // Spatie absent ou erreur de registrar : non bloquant.
            }
        }
    }
}
