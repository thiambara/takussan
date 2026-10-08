<?php

namespace App\Services\Agency;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Property\ResponsibleAgentAssigner;
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
 *  - `responsible_properties` (TCK-603) : la marque d'agent principal passe au repreneur par
 *    {@see ResponsibleAgentAssigner} — jamais `user_id` ; un repreneur que le service refuse (co-
 *    propriétaire du bien) laisse le bien DÉSASSIGNÉ, compté comme tel ;
 *  - `held_properties` (TCK-603, ADR-0036 question 2) : `user_id` ← le repreneur, journal du modèle
 *    coupé (ADR-0059 §4 : la signature que lit la réparation n'appartient qu'à l'ancien geste) ;
 *    jamais vers un repreneur qui porte un profil propriétaire de l'agence — désassigné ;
 *  - `collaborations` : la ligne du partant passe au repreneur ; si le repreneur collabore déjà au
 *    bien (unicité `property_id, user_id`), sa ligne est conservée et celle du partant supprimée —
 *    et si celle du partant portait la marque, elle passe d'abord au repreneur (ADR-0053,
 *    « Conséquences ») ;
 *  - `customers` : le référent (`is_primary`) passe au repreneur ; s'il a déjà une relation de même
 *    type avec le client, elle devient la principale et celle du partant est supprimée.
 *
 * **Les verrous** (ADR-0059 §3) : les biens que touchent les trois catégories de biens sont
 * verrouillés d'abord, en une requête, par identifiant croissant ; les lignes de collaboration
 * ensuite. C'est l'ordre de `PrimaryAgentDesignator` (bien → lignes) : jamais lignes → bien, qui
 * interbloquerait avec une désignation concurrente (verif-504).
 */
class AgentHandoverService
{
    public function __construct(
        private readonly AgentPortfolio $portfolio,
        private readonly AgencyMemberRemovalService $removal,
        private readonly ResponsibleAgentAssigner $assigner,
    ) {}

    /** Les catégories qui touchent un bien, et dont les biens se verrouillent avant toute ligne. */
    private const PROPERTY_CATEGORIES = ['responsible_properties', 'held_properties', 'collaborations'];

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

            $locked = $this->lockProperties($agency, $member, $successors);

            foreach (AgentPortfolio::TRANSFERABLE as $category) {
                $successor = $successors[$category] ?? null;
                if ($successor === null) {
                    continue;
                }

                [$ids, $dropped] = $this->move($category, $agency, $member, $successor, $actor, $locked);
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

    /**
     * ADR-0059 §3 — les biens d'abord, par identifiant croissant : deux passations, une désignation
     * et le contrôleur des collaborateurs prennent tous bien → lignes.
     *
     * @param  array<string, User>  $successors
     * @return list<int> les biens verrouillés — l'ensemble hors duquel la passation ne verrouille rien
     */
    private function lockProperties(Agency $agency, User $member, array $successors): array
    {
        $ids = [];
        foreach (self::PROPERTY_CATEGORIES as $category) {
            if (! isset($successors[$category])) {
                continue;
            }
            $query = $this->portfolio->query($category, $agency, $member);
            $ids = [...$ids, ...($category === 'collaborations' ? $query->pluck('property_id') : $query->pluck('id'))->all()];
        }
        if ($ids === []) {
            return [];
        }

        return Property::withTrashed()->whereIn('id', array_unique($ids))->orderBy('id')->lockForUpdate()
            ->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    /**
     * ADR-0059 §6 (verif-603 m3) — un bien entré dans le portefeuille APRÈS le verrou (une ligne validée
     * entre les deux) ne se verrouille pas maintenant : ce serait un bien après des lignes, et hors de
     * l'ordre croissant de l'ensemble. La passation est refusée, sans rien avoir écrit, et se rejoue.
     *
     * @param  list<int>  $propertyIds
     * @param  list<int>  $locked
     */
    private function refuseOutsideLocked(array $propertyIds, array $locked): void
    {
        abort_code_if(array_diff($propertyIds, $locked) !== [], 409, 'agency_member.handover_conflict');
    }

    /**
     * @param  list<int>  $locked  les biens que {@see self::lockProperties()} tient
     * @return array{0: list<int>, 1: list<int>} [déplacés, désassignés]
     */
    private function move(string $category, Agency $agency, User $member, User $successor, User $actor, array $locked): array
    {
        $query = $this->portfolio->query($category, $agency, $member);
        if (in_array($category, ['responsible_properties', 'held_properties'], true)) {
            // Lus SANS verrou : chacun est déjà tenu, ou la passation s'arrête ici.
            $ids = $query->pluck('id')->map(fn ($id) => (int) $id)->all();
            $this->refuseOutsideLocked($ids, $locked);
        } else {
            $ids = $query->lockForUpdate()->pluck('id')->map(fn ($id) => (int) $id)->all();
            if ($category === 'collaborations' && $ids !== []) {
                // Après le verrou des lignes : une ligne apparue entre-temps est vue ici, et la
                // passation s'arrête avant de verrouiller son bien (lignes → bien, l'ordre exclu).
                $this->refuseOutsideLocked(
                    PropertyCollaborator::query()->whereIn('id', $ids)->pluck('property_id')->map(fn ($id) => (int) $id)->unique()->values()->all(),
                    $locked,
                );
            }
        }
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

            case 'responsible_properties':
                $moved = [];
                $dropped = [];
                foreach (Property::query()->whereIn('id', $ids)->orderBy('id')->get() as $property) {
                    $this->assignResponsible($property, $successor, $actor)
                        ? $moved[] = (int) $property->id
                        : $dropped[] = (int) $property->id;
                }

                return [$moved, $dropped];

            case 'held_properties':
                // ADR-0036 question 2 — jamais vers un bailleur de l'agence.
                if ($successor->ownerProfiles()->where('agency_id', $agency->id)->exists()) {
                    return [[], $ids];
                }
                foreach (Property::query()->whereIn('id', $ids)->get() as $property) {
                    // ADR-0059 §4 — journal du modèle coupé : la passation se journalise sous
                    // `AgentHandover`, et la réparation ne la relira pas comme une réattribution.
                    $property->disableLogging()->forceFill(['user_id' => $successor->id])->save();
                }

                return [$ids, []];

            case 'collaborations':
                $dropped = [];
                foreach (PropertyCollaborator::query()->whereIn('id', $ids)->get() as $row) {
                    $taken = PropertyCollaborator::query()
                        ->where('property_id', $row->property_id)
                        ->where('user_id', $successor->id)
                        ->exists();
                    if ($taken && $row->is_primary
                        && ! $this->assignResponsible(Property::query()->findOrFail($row->property_id), $successor, $actor)) {
                        $dropped[] = (int) $row->id;
                    }
                    $taken ? $row->delete() : $row->update(['user_id' => $successor->id]);
                }

                return [array_values(array_diff($ids, $dropped)), $dropped];

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

    /**
     * La marque passe au repreneur ; `false` quand le service refuse la cible pour CE bien
     * (co-propriétaire, inéligible) — le bien est alors désassigné, pas la passation annulée.
     */
    private function assignResponsible(Property $property, User $successor, User $actor): bool
    {
        try {
            $this->assigner->assign($property, $successor, $actor);
        } catch (ApiError $e) {
            if (! in_array($e->errorCode, ResponsibleAgentAssigner::TARGET_REFUSALS, true)) {
                throw $e;
            }

            return false;
        }

        return true;
    }

    /** TCK-592 — règle d'éligibilité d'une intervention ; avant sa fusion, le personnel actif de l'agence (TCK-587). */
    private function eligibleForMaintenance(User $user, int $agencyId): bool
    {
        return app(MembershipCapabilityResolver::class)->isStaffAt($user, $agencyId);
    }
}
