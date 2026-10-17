<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\IncludedUserResource;
use App\Models\User;
use App\Support\AgencyKindGuard;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

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
        //
        // TCK-665 (piste P03.02) — hors super-admin, les `include=…Profiles` et `filter[role]`
        // sont bornés à l'agence active, et `include=platformProfile` est refusé : la base bornée
        // ci-dessus ne suffisait pas, les relations chargées sortaient les profils des autres
        // agences de la personne listée.
        $query = $base === null
            ? User::buildQuery(null, $request)
            : User::buildAgencyTeamQuery($base, $request, (int) $agencyId);

        $paginator = $query
            ->defaultSorts(...User::defaultSortsWithRelevance('-created_at'))
            ->paginate();

        // TCK-589 — la colonne 2FA de la console d'équipe (`/app/agency/team` lit cette
        // liste) : champ calculé, jamais via `User::$queryFields` (cf. `TeamController`).
        $items = $paginator->items();
        $enabled = User::query()->whereKey(array_map(fn (User $u) => $u->getKey(), $items))->pluck('two_factor_enabled', 'id');
        foreach ($items as $item) {
            $item->setAttribute('two_factor_enabled', (bool) ($enabled[$item->getKey()] ?? false));
        }

        // TCK-791 (piste P21.02) — sans `fields[users]`, la projection par défaut de P21.01 et non
        // la ligne `users` entière (38 clés, `google_id`, `metadata`, second numéro). Les relations
        // demandées par `include=` restent rendues. Avec `fields[users]`, `User::$queryFields`
        // borne déjà les colonnes : ni `google_id` ni `metadata` n'y figurent.
        if (! filled($request->input('fields.users'))) {
            (new Collection($items))->loadMissing('media');
            $items = array_map(fn (User $user) => [
                ...(new IncludedUserResource($user))->resolve(),
                'two_factor_enabled' => $user->getAttribute('two_factor_enabled'),
                ...Arr::except($user->relationsToArray(), ['media']),
            ], $items);
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
