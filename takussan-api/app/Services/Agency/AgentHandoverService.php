<?php

namespace App\Services\Agency;

use App\Models\Agency;
use App\Models\MaintenanceRequest;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Support\Facades\DB;

/**
 * TCK-591 §8 — la passation du portefeuille d'un membre du personnel qui quitte une agence.
 *
 * **Une transaction** : tout passe, ou rien ne bouge. **Une entrée de journal par catégorie**
 * (`activity('AgentHandover')`), avec les identifiants déplacés. Puis, si demandé, le retrait —
 * dans la même transaction : un retrait refusé (dernier admin, portefeuille encore non vide) annule
 * aussi la passation.
 *
 * Les règles de chaque catégorie :
 *  - `tasks`, `visits` : réassignées ;
 *  - `maintenance` : réassignée si le repreneur y est éligible, sinon DÉSASSIGNÉE et comptée comme
 *    telle (règle d'éligibilité de TCK-592 ; avant sa fusion, le personnel de l'agence) ;
 *  - `collaborations` : la ligne du partant passe au repreneur ; si le repreneur collabore déjà au
 *    bien (unicité `property_id, user_id`), sa ligne est conservée et celle du partant supprimée ;
 *  - `customers` : le référent (`is_primary`) passe au repreneur ; s'il a déjà une relation de même
 *    type avec le client, elle devient la principale et celle du partant est supprimée.
 *
 * ⚠ `held_properties` et `responsible_properties` attendent TCK-504 (cf. {@see AgentPortfolio}).
 */
class AgentHandoverService
{
    public function __construct(
        private readonly AgentPortfolio $portfolio,
        private readonly AgencyMemberRemovalService $removal,
    ) {}

    /** @return array<string, int> */
    public function inventory(Agency $agency, User $member): array
    {
        return $this->portfolio->inventory($agency, $member);
    }

    /**
     * @param  array<string, User>  $successors  catégorie → repreneur ; une catégorie absente reste en place
     * @return array{moved: array<string, list<int>>, unassigned: array<string, list<int>>, removed_profiles: ?list<string>}
     */
    public function transfer(
        Agency $agency,
        User $member,
        array $successors,
        User $actor,
        bool $removeAfter = false,
        bool $leaveUnassigned = false,
    ): array {
        return DB::transaction(function () use ($agency, $member, $successors, $actor, $removeAfter, $leaveUnassigned) {
            $moved = [];
            $unassigned = [];

            foreach (AgentPortfolio::TRANSFERABLE as $category) {
                $successor = $successors[$category] ?? null;
                if ($successor === null) {
                    continue;
                }

                [$ids, $dropped] = $this->move($category, $agency, $member, $successor);
                if ($ids === [] && $dropped === []) {
                    continue;
                }
                $moved[$category] = $ids;
                if ($dropped !== []) {
                    $unassigned[$category] = $dropped;
                }

                activity('AgentHandover')
                    ->causedBy($actor)
                    ->performedOn($member)
                    ->withProperties([
                        'agency_id' => $agency->id,
                        'member_id' => $member->id,
                        'successor_id' => $successor->id,
                        'category' => $category,
                        'ids' => $ids,
                        'unassigned_ids' => $dropped,
                    ])
                    ->event($category)
                    ->log('agent_handover.'.$category);
            }

            $removed = $removeAfter
                ? $this->removal->remove($agency, $member, $actor, $leaveUnassigned)
                : null;

            return ['moved' => $moved, 'unassigned' => $unassigned, 'removed_profiles' => $removed];
        });
    }

    /** @return array{0: list<int>, 1: list<int>} [déplacés, désassignés] */
    private function move(string $category, Agency $agency, User $member, User $successor): array
    {
        $ids = $this->portfolio->query($category, $agency, $member)->lockForUpdate()->pluck('id')->map(fn ($id) => (int) $id)->all();
        if ($ids === []) {
            return [[], []];
        }

        switch ($category) {
            case 'tasks':
                DB::table('tasks')->whereIn('id', $ids)->update(['assigned_to_id' => $successor->id, 'updated_at' => now()]);

                return [$ids, []];

            case 'visits':
                DB::table('property_visits')->whereIn('id', $ids)->update(['agent_id' => $successor->id, 'updated_at' => now()]);

                return [$ids, []];

            case 'maintenance':
                if ($this->eligibleForMaintenance($successor, (int) $agency->id)) {
                    MaintenanceRequest::query()->whereIn('id', $ids)->update(['assigned_to' => $successor->id]);

                    return [$ids, []];
                }
                MaintenanceRequest::query()->whereIn('id', $ids)->update(['assigned_to' => null]);

                return [[], $ids];

            case 'collaborations':
                foreach (PropertyCollaborator::query()->whereIn('id', $ids)->get() as $row) {
                    $taken = PropertyCollaborator::query()
                        ->where('property_id', $row->property_id)
                        ->where('user_id', $successor->id)
                        ->exists();
                    $taken ? $row->delete() : $row->update(['user_id' => $successor->id]);
                }

                return [$ids, []];

            case 'customers':
                foreach (UserCustomerRelationship::query()->whereIn('id', $ids)->get() as $row) {
                    $existing = UserCustomerRelationship::query()
                        ->where('customer_id', $row->customer_id)
                        ->where('user_id', $successor->id)
                        ->where('relationship_type', $row->relationship_type)
                        ->first();
                    if ($existing !== null) {
                        $row->delete();
                        $existing->update(['is_primary' => true, 'status' => $row->status]);
                    } else {
                        $row->update(['user_id' => $successor->id]);
                    }
                }

                return [$ids, []];
        }

        return [[], []];
    }

    /** TCK-592 — règle d'éligibilité d'une intervention ; avant sa fusion, le personnel de l'agence (TCK-587). */
    private function eligibleForMaintenance(User $user, int $agencyId): bool
    {
        return $user->isAgentAt($agencyId) || $user->isAgencyAdminAt($agencyId);
    }
}
