<?php

namespace App\Services\Agency;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\VisitStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-591 §8 — ce qu'un membre du personnel laisse derrière lui dans UNE agence.
 *
 * Une catégorie = une requête, partagée par l'inventaire (`GET …/portfolio`), la passation et la
 * garde du retrait (`portfolio_not_empty`) : les trois comptent la même chose.
 *
 * Seul le travail EN COURS compte : une tâche terminée, une visite passée, une intervention close
 * restent à leur auteur — c'est l'histoire, pas le portefeuille.
 *
 * ⚠ `held_properties` (biens dont `user_id` = le partant) est COMPTÉ mais pas encore TRANSMIS :
 * son transfert attend TCK-504 (ADR-0036, question 2), comme `responsible_properties`, que la
 * marque de collaborateur principal de 504 portera. Le compter garde le retrait honnête : un agent
 * qui tient encore des biens de l'agence ne se retire pas sans `leave_unassigned` assumé.
 */
class AgentPortfolio
{
    /** Les catégories que la passation transmet. */
    public const TRANSFERABLE = ['tasks', 'visits', 'maintenance', 'collaborations', 'customers'];

    /** Comptées, non transmises : elles attendent TCK-504. */
    public const PENDING = ['held_properties'];

    public const CLOSED_MAINTENANCE = [
        MaintenanceStatus::Completed,
        MaintenanceStatus::Closed,
        MaintenanceStatus::Cancelled,
        MaintenanceStatus::Rejected,
    ];

    /** @return array<string, int> */
    public function inventory(Agency $agency, User $member): array
    {
        $counts = [];
        foreach ([...self::TRANSFERABLE, ...self::PENDING] as $category) {
            $counts[$category] = $this->query($category, $agency, $member)->count();
        }

        return $counts;
    }

    public function isEmpty(Agency $agency, User $member): bool
    {
        return array_sum($this->inventory($agency, $member)) === 0;
    }

    public function query(string $category, Agency $agency, User $member): Builder
    {
        $agencyId = (int) $agency->id;
        $inAgency = fn (Builder $q) => $q->where('agency_id', $agencyId);

        return match ($category) {
            'tasks' => Task::query()
                ->where('assigned_to_id', $member->id)
                ->whereIn('status', Task::OPEN_STATUSES)
                ->whereHasMorph('taskable', [Customer::class, Property::class], $inAgency),
            'visits' => PropertyVisit::query()
                ->where('agent_id', $member->id)
                ->whereIn('status', [VisitStatus::Scheduled, VisitStatus::Confirmed])
                ->where('scheduled_at', '>=', now())
                ->whereHas('property', $inAgency),
            'maintenance' => MaintenanceRequest::query()
                ->where('assigned_to', $member->id)
                ->whereNotIn('status', self::CLOSED_MAINTENANCE)
                ->whereHas('property', $inAgency),
            // verif-591 M2 — une collaboration d'AGENT se passe ; une co-propriété, non.
            'collaborations' => PropertyCollaborator::query()
                ->where('user_id', $member->id)
                ->where('role', CollaboratorRole::Agent)
                ->whereHas('property', $inAgency),
            'customers' => UserCustomerRelationship::query()
                ->where('user_id', $member->id)
                ->where('is_primary', true)
                ->where('status', RelationshipStatus::Active)
                ->whereHas('customer', $inAgency),
            'held_properties' => Property::query()
                ->where('user_id', $member->id)
                ->where('agency_id', $agencyId),
        };
    }
}
