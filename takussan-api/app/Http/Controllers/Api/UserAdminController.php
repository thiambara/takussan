<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\IncludedUserResource;
use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\Capability;
use App\Models\User;
use App\Services\Membership\AffectationsDeRole;
use App\Services\Reporting\TeamMemberSummary;
use App\Support\AgencyKindGuard;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

class UserAdminController extends Controller
{
    public function index(Request $request, AffectationsDeRole $affectations, TeamMemberSummary $summary): JsonResponse
    {
        $actor = $request->user();
        $agencyId = $request->activeProfile()?->agency_id;

        // TCK-1412 (P148.01, P148.02) — la liste de l'équipe se lit aussi sous la capacité qui
        // ouvre la section `team` du front (`team.invite`, `team.assign_role` ou `team.suspend`),
        // délégations comprises (`canActAt`) : celui qui invite, attribue un rôle ou suspend lit
        // les membres sur lesquels il agit.
        abort_unless(
            $actor->isSuperAdmin()
                || ($agencyId !== null && $actor->isAgencyAdminAt((int) $agencyId))
                || ($agencyId !== null && $this->tientUneCapaciteDEquipe($actor, (int) $agencyId)),
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

            $base = $this->teamBase((int) $agencyId);
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

        // TCK-2665 — `include=team_summary` : ce que chaque membre de la page porte dans l'agence.
        // `commissions_due_amount` ne sort que pour qui lit l'argent de l'agence (`payouts.approve`
        // ou `reports.view_agency`) ; sinon la clé est absente.
        $resumes = [];
        if ($base !== null && in_array('team_summary', $this->includes($request), true)) {
            $agence = Agency::query()->findOrFail($agencyId);
            $resumes = $summary->for(
                (int) $agencyId,
                array_map(fn (User $u) => (int) $u->getKey(), $items),
                $actor->canActAt(Capability::PayoutsApprove, $agence) || $actor->canActAt(Capability::ReportsViewAgency, $agence),
            );
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

        if ($resumes !== []) {
            $items = array_map(function (User|array $item) use ($resumes) {
                $ligne = is_array($item) ? $item : $item->toArray();

                return [...$ligne, ...($resumes[(int) $ligne['id']] ?? [])];
            }, $items);
        }

        // TCK-1770 (P136.04) — sur demande, les affectations de rôle des lignes de la page, jugées
        // par la règle de `GET /api/agencies/{agency}/role-assignments` (`AgencyRolePolicy::viewAny`,
        // `team.assign_role`). Un lecteur de la liste qui ne la tient pas ne les reçoit pas, comme il
        // reçoit 403 là-bas. Hors agence active (super-admin sans profil d'agence) : rien à rendre.
        $extra = [];
        $agence = $agencyId !== null && $request->boolean('with_role_assignments')
            ? Agency::query()->find($agencyId)
            : null;
        if ($agence !== null && $actor->can('viewAny', [AgencyRole::class, $agence])) {
            $extra['role_assignments'] = $affectations->pour(
                $agence,
                array_map(fn (User $u) => (int) $u->getKey(), $paginator->items()),
            );
        }

        // TCK-2665 — les pastilles de l'équipe : comptes par rôle et absents, sur l'ensemble filtré
        // HORS `filter[role]` (la liste des collaborateurs garde le compte des bailleurs), pas sur la page.
        if ($base !== null) {
            $sansRole = $request->duplicate(Arr::except($request->query(), []));
            $filtres = $sansRole->query('filter');
            if (is_array($filtres)) {
                unset($filtres['role']);
                $sansRole->query->set('filter', $filtres);
            }
            $ensemble = User::buildAgencyTeamQuery($this->teamBase((int) $agencyId), $sansRole, (int) $agencyId)
                ->getEloquentBuilder()
                ->reorder();
            $extra['counts'] = $summary->counts($ensemble, (int) $agencyId);
        }

        return $this->paginated($paginator, $items, $extra);
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

    /**
     * Les membres de l'agence : un profil d'agent, de bailleur ou d'administrateur dans l'agence.
     * TCK-2665 — extrait : `meta.counts` repart de la même base.
     *
     * @return Builder<User>
     */
    private function teamBase(int $agencyId): Builder
    {
        return User::query()->where(function ($q) use ($agencyId) {
            $q->whereHas('agentProfiles', fn ($qq) => $qq->where('agency_id', $agencyId))
                ->orWhereHas('ownerProfiles', fn ($qq) => $qq->where('agency_id', $agencyId))
                ->orWhereHas('agencyAdminProfiles', fn ($qq) => $qq->where('agency_id', $agencyId));
        });
    }

    /**
     * Les noms de `include=` (virgules ou liste).
     *
     * @return list<string>
     */
    private function includes(Request $request): array
    {
        $valeur = $request->query('include');
        $noms = is_array($valeur) ? $valeur : explode(',', (string) $valeur);

        return array_values(array_filter(array_map(fn ($n) => is_string($n) ? trim($n) : '', $noms)));
    }

    /** Les capacités qui ouvrent la section `team` du front (`PAGES_ADMIN`, TCK-1412). */
    private function tientUneCapaciteDEquipe(User $actor, int $agencyId): bool
    {
        $agency = Agency::query()->find($agencyId);

        return $agency !== null && collect([
            Capability::TeamInvite,
            Capability::TeamAssignRole,
            Capability::TeamSuspend,
        ])->contains(fn (Capability $capacite) => $actor->canActAt($capacite, $agency));
    }
}
