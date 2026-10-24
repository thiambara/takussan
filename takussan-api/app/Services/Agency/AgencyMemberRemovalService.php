<?php

namespace App\Services\Agency;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Enums\ConversationType;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Calendar\CalendarFeedService;
use App\Services\Permissions\RoleDelegationService;
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
 *    bailleur seul n'est pas « retiré de l'équipe » : 422 `agency_member.not_staff` ;
 *  - un portefeuille non vide exige une passation, ou `leave_unassigned` ASSUMÉ (422
 *    `agency_member.portfolio_not_empty`, avec les comptes) ;
 *  - un journal `activity('Membership')` : `agent_removed` / `agency_admin_removed` ;
 *  - l'extinction de ce que la présence ouvrait : flux iCalendar du membre dans l'agence (ADR-0034),
 *    délégations et absences où il figure (ADR-0035), marque d'agent principal de ses lignes de
 *    collaboration (TCK-1333 — la ligne reste).
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
            abort_code_if($member->isOwnerAt($agencyId), 422, 'agency_member.not_staff');
            abort_code(422, 'agency_member.not_in_agency');
        }
        abort_code_if($member->id === $agency->primary_admin_id, 422, 'agency_member.cannot_remove_primary_admin');

        if (! $leaveUnassigned && ! $this->portfolio->isEmpty($agency, $member)) {
            throw (new ApiError(422, 'agency_member.portfolio_not_empty'))->with([
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
                abort_code_if($remainingAdmins === 0, 422, 'agency_member.cannot_remove_last_admin');
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
            $this->dropPrimaryMarks($member, $agencyId);
            $this->leaveUnreadableLeaseThreads($member, $agencyId);

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

    /**
     * TCK-1711 (P153.04) — `ConversationAccess` n'a pas de branche « bail » : la participation y
     * suffit. Le retrait fait donc quitter (`left_at`) au retiré les fils rattachés à un bail de
     * l'agence dont il ne lit plus le bail (`LeasePolicy::view`, jugé APRÈS la suppression de ses
     * profils). Le retiré qui reste partie au bail (bailleur, locataire) garde son fil ; les autres
     * participants ne sont pas touchés.
     */
    private function leaveUnreadableLeaseThreads(User $member, int $agencyId): void
    {
        $retire = $member->fresh();
        if ($retire === null) {
            return;
        }

        ConversationParticipant::query()
            ->where('user_id', $member->id)
            ->whereNull('left_at')
            ->whereIn('conversation_id', Conversation::query()
                ->whereIn('lease_id', Lease::query()->where('agency_id', $agencyId)->select('id'))
                ->select('id'))
            ->with('conversation.lease')
            ->get()
            ->reject(fn (ConversationParticipant $p) => $p->conversation?->lease !== null && $retire->can('view', $p->conversation->lease))
            ->each(fn (ConversationParticipant $p) => $p->forceFill(['left_at' => now()])->save());

        // P191.02 (TCK-2021) — de même pour un groupe rattaché au seul bien (sans bail) d'un bien de
        // l'agence, jugé par `PropertyPolicy::view` : `NewGroupDialog` ouvre de tels groupes.
        ConversationParticipant::query()
            ->where('user_id', $member->id)
            ->whereNull('left_at')
            ->whereIn('conversation_id', Conversation::query()
                ->where('type', ConversationType::Group->value)
                ->whereNull('lease_id')
                ->whereIn('property_id', Property::withTrashed()->where('agency_id', $agencyId)->select('id'))
                ->select('id'))
            ->with(['conversation.property' => fn ($q) => $q->withTrashed()])
            ->get()
            ->reject(fn (ConversationParticipant $p) => $p->conversation?->property !== null && $retire->can('view', $p->conversation->property))
            ->each(fn (ConversationParticipant $p) => $p->forceFill(['left_at' => now()])->save());
    }

    /**
     * TCK-1333 (P121.04, décision du porteur) — un non-membre ne porte plus la marque d'agent
     * principal d'un bien de l'agence : elle tombe dans le repli, comme pour un repreneur refusé
     * (TCK-1253). La ligne reste — seule la marque part. Les biens sont verrouillés d'abord, par
     * identifiant croissant (ADR-0059 §3 : bien → lignes, l'ordre de `PrimaryAgentDesignator`).
     */
    private function dropPrimaryMarks(User $member, int $agencyId): void
    {
        $marked = fn () => PropertyCollaborator::query()
            ->where('user_id', $member->id)
            ->where('is_primary', true)
            ->whereIn('property_id', Property::withTrashed()->where('agency_id', $agencyId)->select('id'));

        $propertyIds = $marked()->pluck('property_id')->all();
        if ($propertyIds === []) {
            return;
        }
        Property::withTrashed()->whereIn('id', $propertyIds)->orderBy('id')->lockForUpdate()->pluck('id');

        foreach ($marked()->get() as $row) {
            $row->forceFill(['is_primary' => false])->save();
        }
    }
}
