<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\UpdateAgencyMemberRoleRequest;
use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * TCK-278 — Agency-scoped member role mutation, profile-based.
 *
 * Route: PUT /api/agencies/{agency}/members/{user}/role
 *
 * Le rôle est désormais la présence d'un profil polymorphe (cf. Règle 5
 * du models-spec). Cet endpoint enforce que le user cible est membre de
 * l'agence dans l'URL, puis swap les profils agence-scopés.
 */
class AgencyMemberRoleController extends Controller
{
    public function update(UpdateAgencyMemberRoleRequest $request, Agency $agency, User $user): JsonResponse
    {
        $actor = $request->user();

        abort_unless(
            $actor->isSuperAdmin()
                || $agency->primary_admin_id === $actor->id
                || (
                    $request->activeProfile()?->agency_id === $agency->id
                    && $actor->isAgencyAdminAt((int) $agency->id)
                ),
            403,
        );

        abort_unless(
            $user->isAgentAt($agency->id)
                || $user->isOwnerAt($agency->id)
                || $user->isAgencyAdminAt($agency->id),
            422,
            __('messages.user_not_in_agency'),
        );

        $data = $request->validated();

        if ($data['role'] === 'super_admin' && ! $actor->isSuperAdmin()) {
            abort(403, __('messages.only_super_admin_can_grant_super_admin'));
        }

        // Last-admin invariant : si le target est l'unique agency_admin et
        // le nouveau rôle le lui retire, refuser. Wrap en transaction +
        // lock pour bloquer les courses concurrentes.
        DB::transaction(function () use ($user, $agency, $data) {
            $locked = User::where('id', $user->id)->lockForUpdate()->first();
            if ($data['role'] !== 'agency_admin'
                && $locked
                && $locked->isAgencyAdminAt((int) $agency->id)) {
                $remainingAdmins = AgencyAdminProfile::query()
                    ->where('agency_id', $agency->id)
                    ->whereNull('deleted_at')
                    ->where('user_id', '!=', $user->id)
                    ->lockForUpdate()
                    ->count();
                abort_if($remainingAdmins === 0, 422, __('messages.cannot_remove_last_agency_admin'));
            }

            // Swap profile : delete concurrents, materialize target.
            match ($data['role']) {
                'agency_admin' => $this->setAgencyAdmin($user, (int) $agency->id),
                'agent' => $this->setAgent($user, (int) $agency->id),
                'owner' => $this->setOwner($user, (int) $agency->id),
                default => null, // super_admin / tenant / customer / sp : no-op agence-scoped
            };
        });

        return $this->json([
            'data' => [
                'user_id' => $user->id,
                'agency_id' => $agency->id,
                'role' => $data['role'],
            ],
        ]);
    }

    private function setAgencyAdmin(User $user, int $agencyId): void
    {
        $user->agentProfiles()->where('agency_id', $agencyId)->delete();
        $user->ownerProfiles()->where('agency_id', $agencyId)->delete();
        AgencyAdminProfile::query()->firstOrCreate(
            ['user_id' => $user->id, 'agency_id' => $agencyId],
            ['status' => AgencyAdminProfileStatus::Active->value],
        );
    }

    private function setAgent(User $user, int $agencyId): void
    {
        $user->agencyAdminProfiles()->where('agency_id', $agencyId)->delete();
        $user->ownerProfiles()->where('agency_id', $agencyId)->delete();
        AgentProfile::query()->firstOrCreate(
            ['user_id' => $user->id, 'agency_id' => $agencyId],
            ['status' => AgentProfileStatus::Active->value],
        );
    }

    private function setOwner(User $user, int $agencyId): void
    {
        $user->agencyAdminProfiles()->where('agency_id', $agencyId)->delete();
        $user->agentProfiles()->where('agency_id', $agencyId)->delete();
        OwnerProfile::query()->firstOrCreate(
            ['user_id' => $user->id, 'agency_id' => $agencyId],
        );
    }

    /**
     * @return list<string>
     */
}
