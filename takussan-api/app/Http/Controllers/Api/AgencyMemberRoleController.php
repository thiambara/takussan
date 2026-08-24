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
        // TCK-305 — l'autorisation court dans UpdateAgencyMemberRoleRequest::authorize(), donc AVANT la
        // validation : un appel non autorisé ET mal formé doit rendre 403, pas 422.
        $actor = $request->user();

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
                    // ⚠ `->get(…)->count()` et non `->count()` : PostgreSQL refuse
                    // `FOR UPDATE` sur un agrégat (« FOR UPDATE is not allowed with
                    // aggregate functions »), parce que les lignes à verrouiller y sont
                    // ambiguës. On rapatrie donc les lignes — elles sont verrouillées,
                    // ce qui est tout l'objet — et on les compte en PHP.
                    //
                    // L'invariant est préservé : ce sont EXACTEMENT les mêmes lignes qui
                    // sont verrouillées, et c'est le `delete()` plus bas qui entre en
                    // conflit avec le verrou de l'écrivain concurrent. Le compte n'a
                    // jamais eu besoin d'être calculé côté serveur.
                    //
                    // Le volume est borné par le nombre d'administrateurs d'une agence :
                    // rapatrier ces identifiants ne coûte rien.
                    ->lockForUpdate()
                    ->get(['id'])
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
