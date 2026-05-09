<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\AgencyUpdateRequest;
use App\Http\Resources\AgencyResource;
use App\Http\Resources\UserResource;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Currency;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Billing\QuotaResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

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
            $alreadyOwns && ! ($user->isSuperAdmin() || $user->hasRole('admin')),
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
            || $user->hasRole('admin')
            || $agency->primary_admin_id === $user->id
            || (
                $request->activeProfile()?->agency_id === $agency->id
                && $user->hasRole('agency_admin')
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
            $user->isSuperAdmin() || $user->hasRole('admin') || $agency->primary_admin_id === $user->id,
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

        // Optional post-filter on role — spatie roles aren't a regular column.
        $role = $request->query('filter.role') ?? data_get($request->query('filter', []), 'role');
        if ($role) {
            $query->whereHas('roles', fn ($q) => $q->where('name', $role));
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

        AgentProfile::query()->firstOrCreate(
            ['user_id' => $target->id, 'agency_id' => $agency->id],
            ['status' => AgentProfileStatus::Active->value],
        );

        $role = $data['role'] ?? 'agent';
        Role::findOrCreate($role, 'web');

        // Always scope role assignment to the agency's team, not the requester's
        // team. When super_admin calls this endpoint their team context is null,
        // which would assign the role with team_id = null and break hasRole()
        // checks for the target user on all subsequent requests.
        $registrar = app(PermissionRegistrar::class);
        $originalTeamId = $registrar->getPermissionsTeamId();
        $registrar->setPermissionsTeamId($agency->id);
        $target->unsetRelation('roles');

        if (! $target->hasRole($role)) {
            $target->assignRole($role);
        }

        $registrar->setPermissionsTeamId($originalTeamId);
        $target->unsetRelation('roles');

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

        // Race guard: wrap the last-admin check + mutation in a transaction
        // with a row lock on the target. Without this, two concurrent DELETEs
        // for two distinct agency_admins can both observe "one admin remains"
        // and both succeed, leaving the agency with zero admins.
        $registrar = app(PermissionRegistrar::class);
        $originalTeamId = $registrar->getPermissionsTeamId();

        DB::transaction(function () use ($user, $agency, $registrar) {
            // Scope all role operations to the agency's team. When super_admin
            // calls this endpoint their team context is null, which would cause
            // hasRole() and removeRole() to miss roles assigned with the
            // agency's team_id.
            $registrar->setPermissionsTeamId($agency->id);

            $locked = User::where('id', $user->id)->lockForUpdate()->first();
            if ($locked) {
                $locked->unsetRelation('roles');
                if ($locked->hasRole('agency_admin')) {
                    // TCK-142 — peers in this agency are users with an
                    // AgentProfile here, not users with `agency_id = X`.
                    $remainingAdmins = User::query()
                        ->whereHas('agentProfiles', fn ($q) => $q->where('agency_id', $agency->id))
                        ->whereHas('roles', fn ($q) => $q->where('name', 'agency_admin'))
                        ->where('id', '!=', $user->id)
                        ->lockForUpdate()
                        ->count();
                    abort_if($remainingAdmins === 0, 422, __('messages.cannot_remove_last_agency_admin'));
                }
            }

            $user->agentProfiles()->where('agency_id', $agency->id)->delete();
            foreach (['agent', 'agency_admin'] as $role) {
                $user->unsetRelation('roles');
                if ($user->hasRole($role)) {
                    $user->removeRole($role);
                }
            }
        });

        $registrar->setPermissionsTeamId($originalTeamId);

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
            || $user->hasRole('admin')
            || $agency->primary_admin_id === $user->id
            || (
                $request->activeProfile()?->agency_id === $agency->id
                && $user->hasRole('agency_admin')
            ),
            403,
        );
    }

    private function visibleAgencyQuery(User $user): Builder
    {
        if ($user->isSuperAdmin() || $user->hasRole('admin')) {
            return Agency::query();
        }

        $ids = $this->visibleAgencyIds($user);

        return Agency::query()->whereIn('id', $ids);
    }

    private function canViewAgency(User $user, Agency $agency): bool
    {
        if ($user->isSuperAdmin() || $user->hasRole('admin')) {
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
