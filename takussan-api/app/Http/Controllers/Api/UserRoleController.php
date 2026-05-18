<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * TCK-278 — Refactor : ce contrôleur ne mute plus les rôles spatie. Le
 * « rôle » d'un user est désormais la présence d'un profil polymorphe
 * dans une agence (cf. Règle 5 du models-spec). Le contrat HTTP reste
 * `PUT /api/users/{user}/role  { "role": "agent" }`.
 *
 * Sémantique du PUT :
 *   - super_admin → crée/active un PlatformProfile super_admin (cross-tenant).
 *   - agency_admin / agent / owner → dans l'agence du user, supprime les
 *     profils agence-scopés concurrents et matérialise le profil cible.
 *   - tenant / customer / service_provider → rôles dérivés en P1 ; le PUT
 *     ne crée pas de profil pour eux (le frontend doit utiliser les flows
 *     dédiés — invitation/booking/lease).
 *
 * Rules :
 *   - Only `agency_admin` (within the target user's agency) or
 *     `super_admin` may change roles.
 *   - Only a `super_admin` may assign the `super_admin` role.
 */
class UserRoleController extends Controller
{
    public function update(Request $request, User $user): JsonResponse
    {
        $actor = $request->user();
        $actorAgencyId = $request->activeProfile()?->agency_id ?? $actor->agency_id;

        abort_unless(
            $actor->isSuperAdmin()
                || ($actorAgencyId !== null && $actor->isAgencyAdminAt((int) $actorAgencyId)),
            403,
        );

        $data = $request->validate([
            'role' => ['required', 'string', Rule::in($this->allowedRoles())],
        ]);

        if ($data['role'] === 'super_admin' && ! $actor->isSuperAdmin()) {
            abort(403, __('messages.only_super_admin_can_grant_super_admin'));
        }

        // Agency admins can only manage users within their own agency. The
        // actor's scope is driven by the active profile; the target must
        // hold a profile in that same agency.
        if (! $actor->isSuperAdmin()) {
            if ($actorAgencyId === null
                || (! $user->isAgentAt($actorAgencyId)
                    && ! $user->isOwnerAt($actorAgencyId)
                    && ! $user->isAgencyAdminAt($actorAgencyId))
            ) {
                abort(403, __('messages.target_user_not_in_active_agency'));
            }
        }

        // Pour les rôles agence-scopés, déterminer l'agence cible.
        $targetAgencyId = $data['role'] === 'super_admin'
            ? null
            : ($actor->isSuperAdmin() ? $user->agency_id : $actorAgencyId);

        if ($targetAgencyId === null && $data['role'] !== 'super_admin') {
            abort(422, __('messages.target_user_has_no_active_agency'));
        }

        DB::transaction(function () use ($user, $data, $targetAgencyId) {
            $this->mutateProfileForRole($user, $data['role'], $targetAgencyId);
        });

        return $this->json([
            'data' => [
                'id' => $user->id,
                'role' => $data['role'],
                // TCK-278 — `roles` est dérivé des profils polymorphes
                // (cf. Règle 5) ; expose-le pour rétro-compat des clients
                // qui utilisaient la sortie spatie.
                'roles' => $user->fresh()->profileTypes()->all(),
            ],
        ]);
    }

    /**
     * Matérialise le rôle demandé sous forme de profil polymorphe. Pour
     * les rôles agence-scopés, on supprime les autres profils concurrents
     * dans la même agence pour préserver la sémantique « 1 user = 1 rôle
     * actif par agence ».
     */
    private function mutateProfileForRole(User $user, string $role, ?int $agencyId): void
    {
        if ($role === 'super_admin') {
            $profile = PlatformProfile::query()->firstOrNew(['user_id' => $user->id]);
            $profile->level = PlatformProfileLevel::SuperAdmin;
            $profile->revoked_at = null;
            if (! $profile->exists) {
                $profile->granted_at = now();
            }
            $profile->save();

            return;
        }

        if ($agencyId === null) {
            return;
        }

        // Wipe les profils agence-scopés concurrents avant de matérialiser
        // celui demandé. Idempotent : si le bon profil existe déjà, on le
        // garde tel quel.
        match ($role) {
            'agency_admin' => $this->setAgencyAdmin($user, $agencyId),
            'agent' => $this->setAgent($user, $agencyId),
            'owner' => $this->setOwner($user, $agencyId),
            // tenant / customer / service_provider : pas de profil
            // canonique en P1 ; no-op (le rôle est dérivé).
            default => null,
        };
    }

    private function setAgencyAdmin(User $user, int $agencyId): void
    {
        $user->agentProfiles()->where('agency_id', $agencyId)->delete();
        $user->ownerProfiles()->where('agency_id', $agencyId)->delete();
        $this->materializeOrRestore(
            AgencyAdminProfile::query(),
            ['user_id' => $user->id, 'agency_id' => $agencyId],
            ['status' => AgencyAdminProfileStatus::Active->value],
        );
    }

    private function setAgent(User $user, int $agencyId): void
    {
        $user->agencyAdminProfiles()->where('agency_id', $agencyId)->delete();
        $user->ownerProfiles()->where('agency_id', $agencyId)->delete();
        $this->materializeOrRestore(
            AgentProfile::query(),
            ['user_id' => $user->id, 'agency_id' => $agencyId],
            ['status' => AgentProfileStatus::Active->value],
        );
    }

    private function setOwner(User $user, int $agencyId): void
    {
        $user->agencyAdminProfiles()->where('agency_id', $agencyId)->delete();
        $user->agentProfiles()->where('agency_id', $agencyId)->delete();
        $this->materializeOrRestore(
            OwnerProfile::query(),
            ['user_id' => $user->id, 'agency_id' => $agencyId],
            [],
        );
    }

    /**
     * TCK-278 — Idempotent : si un profil soft-deleted existe sur la même
     * (user_id, agency_id), le restaure plutôt que de tenter un INSERT qui
     * violerait l'index UNIQUE. Si rien n'existe, crée. Si actif, no-op.
     */
    private function materializeOrRestore($query, array $match, array $defaults): void
    {
        $existing = (clone $query)->withTrashed()->where($match)->first();
        if ($existing !== null) {
            if ($existing->trashed()) {
                $existing->restore();
                if ($defaults !== []) {
                    $existing->forceFill($defaults)->save();
                }
            }

            return;
        }
        $query->create(array_merge($match, $defaults));
    }

    /**
     * @return list<string>
     */
    protected function allowedRoles(): array
    {
        return [
            'super_admin',
            'agency_admin',
            'agent',
            'owner',
            'tenant',
            'customer',
            'service_provider',
        ];
    }
}
