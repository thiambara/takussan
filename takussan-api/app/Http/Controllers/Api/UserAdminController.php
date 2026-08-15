<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\UserStatus;
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
        $paginator = User::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate();

        return $this->json([
            'data' => $paginator->items(),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
            ],
        ]);
    }

    public function block(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        $agencyId = $request->activeProfile()?->agency_id;

        abort_unless(
            $actor->isSuperAdmin()
                || ($agencyId !== null && $actor->isAgencyAdminAt((int) $agencyId)),
            403,
        );
        abort_if($user->id === $actor->id, 422, __('messages.cannot_block_self'));

        $this->ensureTargetInActorScope($request, $user);

        $user->update(['status' => UserStatus::Blocked]);
        $user->tokens()->delete();

        return $this->json(['data' => ['id' => $user->id, 'status' => $user->status]]);
    }

    public function activate(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        $agencyId = $request->activeProfile()?->agency_id;

        abort_unless(
            $actor->isSuperAdmin()
                || ($agencyId !== null && $actor->isAgencyAdminAt((int) $agencyId)),
            403,
        );

        $this->ensureTargetInActorScope($request, $user);

        $user->update(['status' => UserStatus::Active]);

        return $this->json(['data' => ['id' => $user->id, 'status' => $user->status]]);
    }

    /**
     * TCK-147 — for non-global actors, enforce that the target holds an
     * agent or owner profile in the actor's active agency. `super_admin`
     * and global `admin` bypass this check (cross-tenant by design).
     */
    protected function ensureTargetInActorScope(Request $request, User $target): void
    {
        $actor = $request->user();
        if ($actor->isSuperAdmin()) {
            return;
        }

        $agencyId = $request->activeProfile()?->agency_id;
        AgencyKindGuard::ensureStandardForNonGlobal($actor, $agencyId);
        if ($agencyId === null
            || (! $target->isAgentAt($agencyId)
                && ! $target->isOwnerAt($agencyId)
                && ! $target->isAgencyAdminAt($agencyId))
        ) {
            abort(422, __('messages.target_user_not_in_active_agency'));
        }
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->isSuperAdmin(), 403);
        abort_if($user->id === $request->user()->id, 422, __('messages.cannot_delete_self'));

        $this->anonymize($user);

        return $this->json(null, 204);
    }

    public function deleteOwnAccount(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->tokens()->delete();
        $this->anonymize($user);

        return $this->json(null, 204);
    }

    protected function anonymize(User $user): void
    {
        $user->tokens()->delete();
        $user->update([
            'first_name' => 'Deleted',
            'last_name' => 'User',
            'email' => 'deleted-'.$user->id.'@anonymized.local',
            'phone' => null,
            'bio' => null,
            'status' => UserStatus::Blocked,
            'google_id' => null,
            'facebook_id' => null,
            'apple_id' => null,
            'metadata' => null,
        ]);
        $user->delete();
    }
}
