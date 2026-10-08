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
 * garde du retrait (`agency_member.portfolio_not_empty`) : les trois comptent la même chose.
 *
 * Seul le travail EN COURS compte : une tâche terminée, une visite passée, une intervention close
 * restent à leur auteur — c'est l'histoire, pas le portefeuille.
 *
 * Les biens (TCK-603, ADR-0036, ADR-0059 §3) :
 *  - `responsible_properties` : les biens de l'agence dont la ligne `agent` MARQUÉE principale est
 *    celle du partant — le choix de l'agence, que la passation transmet par
 *    `ResponsibleAgentAssigner`. Un bien sans marque suit sa ligne de collaboration ;
 *  - `held_properties` : les biens de l'agence dont `user_id` = le partant, qu'il a saisis pour
 *    l'agence. AUCUN s'il porte un profil propriétaire de l'agence, quel qu'en soit le statut : ses
 *    propres biens ne se distinguent pas des autres par la colonne, et un bailleur n'est jamais
 *    dépossédé.
 *
 * L'ORDRE de {@see self::TRANSFERABLE} est celui de la passation : les biens avant les
 * collaborations, pour que la marque passe au repreneur avant que la ligne du partant ne bouge.
 */
class AgentPortfolio
{
    /** Les catégories que la passation transmet, dans l'ordre où elle les traite. */
    public const TRANSFERABLE = ['tasks', 'visits', 'maintenance', 'responsible_properties', 'held_properties', 'collaborations', 'customers'];

    /** Comptées, non transmises : aucune depuis TCK-603. */
    public const PENDING = [];

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
            'responsible_properties' => Property::query()
                ->where('agency_id', $agencyId)
                ->whereHas('collaborators', fn (Builder $q) => $q
                    ->where('user_id', $member->id)
                    ->where('role', CollaboratorRole::Agent)
                    ->where('is_primary', true)),
            'held_properties' => Property::query()
                ->where('user_id', $member->id)
                ->where('agency_id', $agencyId)
                ->whereNotExists(fn ($q) => $q->selectRaw('1')->from('owner_profiles')
                    ->where('owner_profiles.user_id', $member->id)
                    ->where('owner_profiles.agency_id', $agencyId)
                    ->whereNull('owner_profiles.deleted_at')),
        };
    }
}
