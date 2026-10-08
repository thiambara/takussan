<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\User;
use App\Support\AgencyKindGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();
        $agencyId = $request->activeProfile()?->agency_id;

        abort_unless(
            $actor->isSuperAdmin()
                || ($agencyId !== null && $actor->isAgencyAdminAt((int) $agencyId)),
            403,
        );

        // TCK-147 — `super_admin` keeps the cross-tenant scope.
        // `agency_admin` is restricted to users attached to the **active
        // profile's** agency (resolved by `ResolveActiveProfile`) via any
        // of the polymorphic profile types.
        //
        // TCK-277 — `agencyAdminProfiles` added to the OR list so pure
        // agency admins (no agent/owner profile) appear in the listing.
        $base = null;
        if (! $actor->isSuperAdmin()) {
            AgencyKindGuard::ensureStandardForNonGlobal($actor, $agencyId);

            $base = User::query()->where(function ($q) use ($agencyId) {
                $q->whereHas('agentProfiles', fn ($qq) => $qq->where('agency_id', $agencyId))
                    ->orWhereHas('ownerProfiles', fn ($qq) => $qq->where('agency_id', $agencyId))
                    ->orWhereHas('agencyAdminProfiles', fn ($qq) => $qq->where('agency_id', $agencyId));
            });
        }

        // `filter[role]` is delegated to a spatie/laravel-QUERY-BUILDER
        // callback on User (TCK-147) so it's whitelisted and applies even with
        // sparse fields. TCK-278 — that callback resolves the role against the
        // polymorphic profiles, not against any spatie/laravel-permission
        // table: only the query-builder package is still installed.
        // TCK-281 — `defaultSortsWithRelevance()` doit être évalué APRÈS
        // `buildQuery()`, qui est ce qui interroge Meilisearch.
        $query = User::buildQuery($base, $request);

        $paginator = $query
            ->defaultSorts(...User::defaultSortsWithRelevance('-created_at'))
            ->paginate();

        // TCK-589 — la colonne 2FA de la console d'équipe (`/admin/team` lit cette
        // liste) : champ calculé, jamais via `User::$queryFields` (cf. `TeamController`).
        $items = $paginator->items();
        $enabled = User::query()->whereKey(array_map(fn (User $u) => $u->getKey(), $items))->pluck('two_factor_enabled', 'id');
        foreach ($items as $item) {
            $item->setAttribute('two_factor_enabled', (bool) ($enabled[$item->getKey()] ?? false));
        }

        return $this->paginated($paginator, $items);
    }

    // TCK-587 (ADR-0031 §2) — bloquer un COMPTE est un geste de la plateforme seule ; l'admin
    // d'agence suspend un membre DANS son agence (`Agency\TeamMemberSuspensionController`).
    // TCK-600 (verif-600 m1) — `block` et `activate` sont SUPPRIMÉS d'ici : second chemin du cycle
    // de vie, sans motif ni trace. Ils passent par `Admin\UserLifecycleController`.
    //
    // TCK-600 — `destroy`, `deleteOwnAccount` et leur copie locale d'`anonymize()` sont SUPPRIMÉS.
    // Ils effaçaient un compte sur-le-champ, sans obligations, sans délai de grâce, sans activité,
    // et `deleteOwnAccount` sans step-up. L'effacement n'a plus qu'un chemin :
    // `AccountDeletionService` — demande par l'utilisateur (`me/deletion-request`) ou par un
    // opérateur (`POST /api/admin/users/{user}/erase`).
}
