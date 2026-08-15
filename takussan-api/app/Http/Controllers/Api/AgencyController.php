<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\AgencyUpdateRequest;
use App\Http\Resources\AgencyResource;
use App\Http\Resources\UserResource;
use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Currency;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Billing\QuotaResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AgencyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $paginator = Agency::buildQuery($this->visibleAgencyQuery($request->user()), $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->json([
            'data' => AgencyResource::collection($paginator)->toArray($request),
            'meta' => ['total' => $paginator->total(), 'current_page' => $paginator->currentPage()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $alreadyOwns = Agency::where('primary_admin_id', $user->id)->exists();
        abort_if(
            $alreadyOwns && ! ($user->isSuperAdmin()),
            422,
            'You already administer an agency.'
        );

        $data = $request->validate([
            'name' => ['required', 'string'],
            'license_number' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'email' => ['nullable', 'email'],
            'phone' => ['nullable', 'string'],
            'website' => ['nullable', 'url'],
            'commission_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            'status' => ['nullable', Rule::enum(AgencyStatus::class)],
        ]);

        $agency = Agency::create(array_merge($data, [
            'primary_admin_id' => $user->id,
            'currency' => $data['currency'] ?? Currency::default()->value,
            'status' => $data['status'] ?? AgencyStatus::Active->value,
        ]));

        return $this->json(['data' => AgencyResource::make($agency)->toArray($request)], 201);
    }

    public function show(Request $request, Agency $agency): JsonResponse
    {
        abort_unless($this->canViewAgency($request->user(), $agency), 404);

        return $this->json(['data' => AgencyResource::make($agency)->toArray($request)]);
    }

    public function update(AgencyUpdateRequest $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        abort_unless(
            $user->isSuperAdmin()
            || $agency->primary_admin_id === $user->id
            || (
                $request->activeProfile()?->agency_id === $agency->id
                && $user->isAgencyAdminAt((int) $agency->id)
            ),
            403
        );

        $data = $request->validated();

        $agency->fill($data)->save();

        return $this->json(['data' => AgencyResource::make($agency->refresh())->toArray($request)]);
    }

    public function destroy(Request $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        abort_unless(
            $user->isSuperAdmin() || $agency->primary_admin_id === $user->id,
            403
        );
        // destroy is intentionally restricted to super_admin and primary_admin_id — agency_admin can edit but not delete.

        $agency->delete();

        return $this->json(null, 204);
    }

    /**
     * List members of an agency. Supports spatie filters (role, search) and
     * sparse fieldsets. The `role` filter is honoured post-query because
     * spatie roles live on a separate pivot.
     */
    public function listMembers(Request $request, Agency $agency): JsonResponse
    {
        $this->authorizeAdmin($request, $agency);

        // TCK-142 — "members" of an agency are users with any agency-scoped
        // profile (owner or agent) at that agency, replacing the old direct
        // foreign-key filter on the user.
        $base = User::query()->where(function ($q) use ($agency) {
            $q->whereHas('agentProfiles', fn ($qq) => $qq->where('agency_id', $agency->id))
                ->orWhereHas('ownerProfiles', fn ($qq) => $qq->where('agency_id', $agency->id));
        });
        $query = User::buildQuery($base, $request)
            ->defaultSort('-created_at');

        // TCK-278 — Filtre `?filter[role]=...` désormais résolu via les
        // profils polymorphes plutôt que la table spatie `roles`.
        $role = $request->query('filter.role') ?? data_get($request->query('filter', []), 'role');
        if ($role) {
            match ($role) {
                'agent' => $query->whereHas('agentProfiles'),
                'agency_admin' => $query->whereHas('agencyAdminProfiles'),
                'owner' => $query->whereHas('ownerProfiles'),
                default => $query->whereRaw('1 = 0'),
            };
        }

        $paginator = $query->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => UserResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
            ],
        ]);
    }

    public function addAgent(Request $request, Agency $agency): JsonResponse
    {
        $this->authorizeAdmin($request, $agency);
        app(QuotaResolver::class)->assertCanAddAgent($agency);

        $data = $request->validate([
            'user_id' => ['nullable', 'integer', 'exists:users,id', 'required_without:email'],
            'email' => ['nullable', 'email', 'required_without:user_id'],
            'role' => ['nullable', 'string', Rule::in(['agent', 'agency_admin'])],
        ]);

        $target = isset($data['user_id'])
            ? User::findOrFail($data['user_id'])
            : User::where('email', $data['email'])->first();

        abort_if($target === null, 422, __('messages.user_not_found_by_email'));

        // TCK-142 — agency attachment is now profile-driven. Block if the
        // user already has an active agent profile at a different agency,
        // matching the previous "user_already_in_agency" guard.
        $existingElsewhere = $target->agentProfiles()
            ->where('agency_id', '!=', $agency->id)
            ->exists();
        abort_if($existingElsewhere, 422, __('messages.user_already_in_agency'));

        // TCK-278 — Rôle = présence d'un profil polymorphe. On crée toujours
        // un AgentProfile (le rôle de base d'un membre d'équipe) ; si le rôle
        // demandé est `agency_admin`, on matérialise aussi un AgencyAdminProfile
        // sur la même agence.
        AgentProfile::query()->firstOrCreate(
            ['user_id' => $target->id, 'agency_id' => $agency->id],
            ['status' => AgentProfileStatus::Active->value],
        );

        $role = $data['role'] ?? 'agent';
        if ($role === 'agency_admin') {
            AgencyAdminProfile::query()->firstOrCreate(
                ['user_id' => $target->id, 'agency_id' => $agency->id],
                ['status' => AgencyAdminProfileStatus::Active->value],
            );
        }

        return $this->json([
            'data' => [
                'user_id' => $target->id,
                'agency_id' => $agency->id,
                'role' => $role,
                'user' => UserResource::make($target->refresh())->toArray($request),
            ],
        ]);
    }

    public function removeAgent(Request $request, Agency $agency, User $user): JsonResponse
    {
        $this->authorizeAdmin($request, $agency);
        $belongsToAgency = $user->agentProfiles()->where('agency_id', $agency->id)->exists();
        abort_if(! $belongsToAgency, 422, __('messages.user_not_in_agency'));
        abort_if($user->id === $agency->primary_admin_id, 422, __('messages.cannot_remove_primary_admin'));

        // TCK-278 — Last-admin guard : maintenant que le rôle est porté par
        // `AgencyAdminProfile`, on compte les profils admin restants (et non
        // plus les users avec rôle spatie `agency_admin` + agent profile).
        DB::transaction(function () use ($user, $agency) {
            $locked = User::where('id', $user->id)->lockForUpdate()->first();
            if ($locked && $locked->isAgencyAdminAt((int) $agency->id)) {
                $remainingAdmins = AgencyAdminProfile::query()
                    ->where('agency_id', $agency->id)
                    ->whereNull('deleted_at')
                    ->where('user_id', '!=', $user->id)
                    ->lockForUpdate()
                    ->count();
                abort_if($remainingAdmins === 0, 422, __('messages.cannot_remove_last_agency_admin'));
            }

            $user->agentProfiles()->where('agency_id', $agency->id)->delete();
            $user->agencyAdminProfiles()->where('agency_id', $agency->id)->delete();
        });

        return $this->json(['data' => ['user_id' => $user->id, 'removed' => true]]);
    }

    protected function authorizeAdmin(Request $request, Agency $agency): void
    {
        $user = $request->user();
        // Strict active-profile match prevents an actor who is agency_admin
        // at agency Y (active) from administering agency X just because they
        // hold a member profile there — they must switch profile first.
        abort_unless(
            $user->isSuperAdmin()
            || $agency->primary_admin_id === $user->id
            || (
                $request->activeProfile()?->agency_id === $agency->id
                && $user->isAgencyAdminAt((int) $agency->id)
            ),
            403,
        );
    }

    private function visibleAgencyQuery(User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return Agency::query();
        }

        $ids = $this->visibleAgencyIds($user);

        return Agency::query()->whereIn('id', $ids);
    }

    private function canViewAgency(User $user, Agency $agency): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        return in_array($agency->id, $this->visibleAgencyIds($user), true);
    }

    /**
     * Agency visibility is profile-driven after TCK-142. Primary-admin links
     * are kept for agencies created before/profile-less onboarding flows.
     *
     * @return list<int>
     */
    private function visibleAgencyIds(User $user): array
    {
        $ids = collect([$user->agency_id])
            ->merge(Agency::query()->where('primary_admin_id', $user->id)->pluck('id'))
            ->merge($user->agentProfiles()->pluck('agency_id'))
            ->merge($user->ownerProfiles()->pluck('agency_id'))
            // `agencyAdminProfiles` manquait, et c'est le profil qui donne le plus de droits.
            //
            // La liste couvrait agent, owner, broker et service_provider — mais pas l'admin
            // d'agence. Tant que `user.agency_id` résolvait, l'agence entrait par la première
            // ligne ; pour un compte MULTI-AGENCES, `ResolveActiveProfile` refuse la bascule
            // automatique, `agency_id` vaut `null`, et l'agence dont l'utilisateur est
            // administrateur devenait invisible pour lui : `show()` rendait 404.
            //
            // *Une liste de profils qui omet le plus privilégié ne se voit pas tant que l'autre
            // chemin fonctionne.*
            //
            // ⚠ PAS de filtre sur `status`, et c'est une décision, pas un oubli. La colonne
            // existe (`active`/`suspended`/`archived`), mais `HasProfiles::isAgencyAdminAt()` —
            // qui accorde les DROITS d'admin — ne la filtre pas non plus. Filtrer ici seulement
            // produirait l'état le plus déroutant qui soit : un administrateur suspendu qui peut
            // agir sur l'agence sans pouvoir la lire. Les deux se décideront ensemble, dans
            // TCK-278 (RBAC), pas à moitié dans un correctif de visibilité.
            //
            // *Resserrer une moitié d'une paire incohérente ne la rend pas cohérente ; cela
            // déplace l'incohérence là où personne ne l'attend.*
            ->merge($user->agencyAdminProfiles()->pluck('agency_id'))
            ->merge(DB::table('broker_profiles')
                ->join('broker_agency_collaborations', 'broker_agency_collaborations.broker_profile_id', '=', 'broker_profiles.id')
                ->where('broker_profiles.user_id', $user->id)
                ->whereNull('broker_profiles.deleted_at')
                ->whereNull('broker_agency_collaborations.deleted_at')
                ->pluck('broker_agency_collaborations.agency_id'))
            ->merge(DB::table('service_provider_profiles')
                ->join('service_provider_agency_collaborations', 'service_provider_agency_collaborations.service_provider_profile_id', '=', 'service_provider_profiles.id')
                ->where('service_provider_profiles.user_id', $user->id)
                ->whereNull('service_provider_profiles.deleted_at')
                ->whereNull('service_provider_agency_collaborations.deleted_at')
                ->pluck('service_provider_agency_collaborations.agency_id'));

        return $ids
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }
}
