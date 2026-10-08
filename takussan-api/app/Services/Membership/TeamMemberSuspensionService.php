<?php

namespace App\Services\Membership;

use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Invitation\AgentInvitationService;
use App\Services\Profiles\ActiveProfileResolver;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * TCK-587 (ADR-0031 §2) — suspendre un membre DANS une agence, jamais sur son compte.
 *
 * Le seul geste qui existait était `POST /api/users/{id}/block` : il posait `users.status`, donc
 * coupait un bailleur présent dans deux agences de l'une ET de l'autre. Ici, seuls les profils de
 * la cible DANS l'agence changent de statut — agent → `suspended`, admin → `suspended`,
 * bailleur → `blocked` — et ADR-0031 §3 fait le reste : un profil non actif ne confère plus rien,
 * dès la requête suivante.
 *
 * Vérification adverse (verif-587) :
 *  - M2 — les deux gestes sont SYMÉTRIQUES : suspendre ne touche que les profils `active`,
 *    réactiver que ceux qu'une suspension a posés (`suspended`, `blocked`). Une invitation `draft`,
 *    un profil `inactive` ou `archived` restent tels quels : « réactiver » faisait d'une invitation
 *    non acceptée du personnel actif, sans le consentement de l'invité. Rien à changer → 422 ;
 *  - M3 — un profil `agency_admin` ne se suspend (ni ne se réactive) que par un admin actif de
 *    l'agence : `team.suspend` délégué à un rôle d'agent ne permet pas d'écarter les admins
 *    (ADR-0031 §2).
 */
class TeamMemberSuspensionService
{
    public function __construct(private readonly AgentInvitationService $agents) {}

    /** @return array{user_id: int, profiles: list<array{type: string, id: int, status: string}>} */
    public function suspend(Agency $agency, User $target, User $actor): array
    {
        $this->assertSuspendable($agency, $target, $actor);

        return $this->apply($agency, $target, $actor, suspend: true);
    }

    /** @return array{user_id: int, profiles: list<array{type: string, id: int, status: string}>} */
    public function reactivate(Agency $agency, User $target, User $actor): array
    {
        $this->assertSuspendable($agency, $target, $actor);

        return $this->apply($agency, $target, $actor, suspend: false);
    }

    private function assertSuspendable(Agency $agency, User $target, User $actor): void
    {
        abort_code_if($target->id === $actor->id, 422, 'team.suspension_self');
        abort_code_if((int) $agency->primary_admin_id === $target->id, 422, 'team.suspension_primary_admin');

        $targetIsAdmin = AgencyAdminProfile::query()
            ->where('user_id', $target->id)
            ->where('agency_id', $agency->id)
            ->exists();
        abort_code_if(
            $targetIsAdmin && ! $actor->isSuperAdmin() && ! $actor->isAgencyAdminAt((int) $agency->id),
            403,
            'team.admin_suspension_reserved',
        );
    }

    /** @return array{user_id: int, profiles: list<array{type: string, id: int, status: string}>} */
    private function apply(Agency $agency, User $target, User $actor, bool $suspend): array
    {
        $profiles = $this->profilesIn($agency, $target);
        abort_code_if($profiles === [], 422, 'user.not_in_active_agency');

        $profiles = array_values(array_filter($profiles, fn (Model $p): bool => $this->changes($p, $suspend)));
        abort_code_if($profiles === [], 422, $suspend ? 'team.nothing_to_suspend' : 'team.nothing_to_reactivate');

        $result = DB::transaction(function () use ($profiles, $target, $actor, $agency, $suspend): array {
            $rows = [];
            foreach ($profiles as $profile) {
                $profile = $this->setStatus($profile, $actor, $suspend);
                $rows[] = [
                    'type' => $this->typeOf($profile),
                    'id' => (int) $profile->getKey(),
                    'status' => $profile->status->value,
                ];
            }

            // Un jeton Sanctum ne porte pas de profil : le profil actif se résout à chaque requête
            // (`ResolveActiveProfile`). Les jetons « dont le profil actif est dans l'agence » sont
            // donc tous ceux d'un membre qui n'a plus aucun profil actif ailleurs ; s'il en garde
            // un, ses jetons servent cette autre agence et la suspension prend effet ici sans eux.
            $revoked = 0;
            if ($suspend && ! $this->keepsAnActiveProfile($target)) {
                $revoked = $target->tokens()->delete();
            }

            activity('team')
                ->causedBy($actor)
                ->performedOn($target)
                ->event($suspend ? 'team_member_suspended' : 'team_member_reactivated')
                ->withProperties([
                    'agency_id' => $agency->id,
                    'target_id' => $target->id,
                    'profiles' => $rows,
                    'tokens_revoked' => $revoked,
                ])
                ->log($suspend ? 'team_member_suspended' : 'team_member_reactivated');

            return $rows;
        });

        return ['user_id' => $target->id, 'profiles' => $result];
    }

    /** @return list<Model> */
    private function profilesIn(Agency $agency, User $target): array
    {
        return [
            ...AgentProfile::query()->where('user_id', $target->id)->where('agency_id', $agency->id)->get()->all(),
            ...AgencyAdminProfile::query()->where('user_id', $target->id)->where('agency_id', $agency->id)->get()->all(),
            ...OwnerProfile::query()->where('user_id', $target->id)->where('agency_id', $agency->id)->get()->all(),
        ];
    }

    /**
     * Suspendre : un profil `active`. Réactiver : un profil que la suspension a posé — agent ou
     * admin `suspended`, bailleur `blocked`. Tout autre statut reste tel quel (M2).
     */
    private function changes(Model $profile, bool $suspend): bool
    {
        $status = $profile->status;

        if ($suspend) {
            return $status === AgentProfileStatus::Active
                || $status === AgencyAdminProfileStatus::Active
                || $status === OwnerProfileStatus::Active;
        }

        return match (true) {
            $profile instanceof AgentProfile => $status === AgentProfileStatus::Suspended,
            $profile instanceof AgencyAdminProfile => $status === AgencyAdminProfileStatus::Suspended,
            $profile instanceof OwnerProfile => $status === OwnerProfileStatus::Blocked,
            default => false,
        };
    }

    private function setStatus(Model $profile, User $actor, bool $suspend): Model
    {
        if ($profile instanceof AgentProfile) {
            // Le chemin existant de la suspension d'agent : même statut, même ligne de journal.
            return $this->agents->suspend($profile, $actor, active: ! $suspend);
        }

        $status = match (true) {
            $profile instanceof AgencyAdminProfile => $suspend ? AgencyAdminProfileStatus::Suspended : AgencyAdminProfileStatus::Active,
            $profile instanceof OwnerProfile => $suspend ? OwnerProfileStatus::Blocked : OwnerProfileStatus::Active,
        };
        $profile->forceFill(['status' => $status])->save();

        return $profile->fresh();
    }

    private function typeOf(Model $profile): string
    {
        return match (true) {
            $profile instanceof AgentProfile => 'agent',
            $profile instanceof AgencyAdminProfile => 'agency_admin',
            default => 'owner',
        };
    }

    private function keepsAnActiveProfile(User $target): bool
    {
        return $target->fresh()->profiles()
            ->contains(fn ($p) => ActiveProfileResolver::isActiveProfile($p));
    }
}
