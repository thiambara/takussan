<?php

namespace App\Http\Middleware;

use App\Models\Enums\PlatformAbility;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-600 (ADR-0047) — `platform-can:<geste>` : la route sert ce geste de la console, et l'appelant
 * doit le détenir à son niveau ({@see PlatformAbility::forLevel()}). Posé par GROUPE dans
 * `routes/api/admin.php`, après `super-admin` ({@see EnsureSuperAdmin}, qui laisse entrer tout
 * opérateur et refuse au-dessous du `super_admin` toute route qui ne déclare rien).
 *
 * Un opérateur au-dessous du `super_admin` n'agit jamais sur un AUTRE OPÉRATEUR : un `support` qui
 * réinitialiserait la 2FA, déverrouillerait ou bloquerait un `super_admin` monterait en privilège
 * par le compte d'un pair. Le geste ne se juge donc pas seul quand la route vise `{user}`.
 */
class EnsurePlatformAbility
{
    public function handle(Request $request, Closure $next, string $ability): Response
    {
        $user = $request->user();
        $geste = PlatformAbility::from($ability);
        if (! $user instanceof User || ! $user->hasPlatformAbility($geste)) {
            abort_code(403, 'platform.ability_missing');
        }

        $cible = $request->route('user');
        if ($cible instanceof User && ! $request->isMethodSafe() && ! $user->isSuperAdmin()
            && $cible->hasActivePlatformProfile()) {
            abort_code(403, 'platform.target_is_operator');
        }

        return $next($request);
    }
}
