<?php

namespace App\Services\Agency;

use App\Models\Agency;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Calendar\CalendarFeedService;
use App\Services\Permissions\RoleDelegationService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;

/**
 * TCK-591 §8 — LE chemin de retrait d'un membre du personnel d'une agence.
 *
 * Il y en avait deux : `AgencyController::removeAgent`, atteint par l'écran Équipe, supprimait les
 * profils sans aucune journalisation ; `AgentInvitationService::remove`, journalisé, n'était atteint
 * que par un endpoint qu'aucun écran n'appelle. Les deux délèguent ici.
 *
 * Ce que le retrait garde et ajoute :
 *  - les deux gardes historiques : l'administrateur principal (`primary_admin_id`) et le dernier
 *    administrateur, compté SOUS VERROU ;
 *  - un membre du personnel seulement — `AgentProfile` OU `AgencyAdminProfile` dans l'agence. Un
 *    bailleur seul n'est pas « retiré de l'équipe » : 422 `member_not_staff` ;
 *  - un portefeuille non vide exige une passation, ou `leave_unassigned` ASSUMÉ (422
 *    `portfolio_not_empty`, avec les comptes) ;
 *  - un journal `activity('Membership')` : `agent_removed` / `agency_admin_removed` ;
 *  - l'extinction de ce que la présence ouvrait : flux iCalendar du membre dans l'agence (ADR-0034),
 *    délégations et absences où il figure (ADR-0035).
 */
class AgencyMemberRemovalService
{
    public function __construct(
        private readonly AgentPortfolio $portfolio,
        private readonly CalendarFeedService $feeds,
        private readonly RoleDelegationService $delegations,
    ) {}

    /** @return list<string> les profils supprimés (`agent`, `agency_admin`) */
    public function remove(Agency $agency, User $member, User $actor, bool $leaveUnassigned = false): array
    {
        $agencyId = (int) $agency->id;
        $hasAgent = $member->agentProfiles()->where('agency_id', $agencyId)->exists();
        $hasAdmin = $member->agencyAdminProfiles()->where('agency_id', $agencyId)->exists();

        if (! $hasAgent && ! $hasAdmin) {
            if ($member->isOwnerAt($agencyId)) {
                $this->fail('member_not_staff', __('team_handover.removal.member_not_staff'));
            }
            abort(422, __('messages.user_not_in_agency'));
        }
        abort_if($member->id === $agency->primary_admin_id, 422, __('messages.cannot_remove_primary_admin'));

        if (! $leaveUnassigned && ! $this->portfolio->isEmpty($agency, $member)) {
            $this->fail('portfolio_not_empty', __('team_handover.removal.portfolio_not_empty'), [
                'portfolio' => $this->portfolio->inventory($agency, $member),
            ]);
        }

        return DB::transaction(function () use ($agencyId, $member, $actor, $hasAgent, $hasAdmin, $leaveUnassigned) {
            $locked = User::query()->whereKey($member->id)->lockForUpdate()->first();
            if ($hasAdmin && $locked !== null) {
                $remainingAdmins = AgencyAdminProfile::query()
                    ->where('agency_id', $agencyId)
                    ->whereNull('deleted_at')
                    ->where('user_id', '!=', $member->id)
                    // `->get()->count()` et non `->count()` : PostgreSQL refuse `FOR UPDATE` sur un
                    // agrégat ; ce sont les lignes verrouillées qui comptent (cf. l'historique de
                    // `AgencyController::removeAgent`).
                    ->lockForUpdate()
                    ->get(['id'])
                    ->count();
                abort_if($remainingAdmins === 0, 422, __('messages.cannot_remove_last_agency_admin'));
            }

            $removed = [];
            if ($hasAgent) {
                $member->agentProfiles()->where('agency_id', $agencyId)->delete();
                $removed[] = 'agent';
            }
            if ($hasAdmin) {
                $member->agencyAdminProfiles()->where('agency_id', $agencyId)->delete();
                $removed[] = 'agency_admin';
            }

            RoleDelegation::query()
                ->where('agency_id', $agencyId)
                ->where(fn ($q) => $q->where('user_id', $member->id)->orWhere('replaces_user_id', $member->id))
                ->whereIn('status', [RoleDelegationStatus::Scheduled, RoleDelegationStatus::Active])
                ->get()
                ->each(fn (RoleDelegation $d) => $this->delegations->revoke($d, $actor));

            $this->feeds->revoke($member, $agencyId);

            activity('Membership')
                ->causedBy($actor)
                ->performedOn($member)
                ->withProperties([
                    'agency_id' => $agencyId,
                    'member_id' => $member->id,
                    'removed_profiles' => $removed,
                    'leave_unassigned' => $leaveUnassigned,
                ])
                ->event($hasAgent ? 'agent_removed' : 'agency_admin_removed')
                ->log($hasAgent ? 'agent_removed' : 'agency_admin_removed');

            return $removed;
        });
    }

    /** @param array<string, mixed> $extra */
    private function fail(string $code, string $message, array $extra = []): never
    {
        throw new HttpResponseException(response()->json(['code' => $code, 'message' => $message, ...$extra], 422));
    }
}
