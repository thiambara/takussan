<?php

namespace App\Services\Reporting;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Customer;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\TaskStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\PropertyVisit;
use App\Models\Task;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-595 (§6) — une ligne par agent ACTIF de l'agence, sur un mois.
 *
 * Chaque indicateur est UNE requête groupée par agent, quel que soit l'effectif. Le nombre de
 * requêtes ne dépend donc pas de la taille de l'équipe. Les indicateurs de période (baux, ventes,
 * visites, clients, commissions) lisent le mois demandé. `properties_managed` et `tasks_overdue`
 * sont à date.
 */
class TeamPerformanceService
{
    /** @return array{period: string, agents: list<array<string, mixed>>} */
    public function forPeriod(Agency $agency, CarbonInterface $month): array
    {
        $from = $month->copy()->startOfMonth();
        $to = $month->copy()->endOfMonth();
        $agencyId = (int) $agency->id;

        $agents = AgentProfile::query()
            ->active()
            ->where('agency_id', $agencyId)
            ->with('user:id,first_name,last_name,username')
            ->orderBy('id')
            ->get();
        $ids = $agents->pluck('user_id')->map(fn ($id) => (int) $id)->all();

        $signed = Lease::query()
            ->where('agency_id', $agencyId)
            ->whereIn('agent_id', $ids)
            ->whereBetween('signed_at', [$from, $to])
            ->whereNotIn('status', [LeaseStatus::Draft->value, LeaseStatus::PendingSignature->value])
            ->toBase()
            ->selectRaw('agent_id, SUM(CASE WHEN type = ? THEN 1 ELSE 0 END) AS sales, SUM(CASE WHEN type = ? THEN 0 ELSE 1 END) AS leases', [LeaseType::Sale->value, LeaseType::Sale->value])
            ->groupBy('agent_id')
            ->get()
            ->keyBy('agent_id');

        $visits = $this->countBy(PropertyVisit::query()
            ->whereIn('agent_id', $ids)
            ->where('status', VisitStatus::Completed->value)
            ->whereBetween('scheduled_at', [$from, $to])
            ->whereHas('property', fn ($q) => $q->where('agency_id', $agencyId)), 'agent_id');

        $customers = $this->countBy(Customer::query()
            ->where('agency_id', $agencyId)
            ->whereIn('added_by_id', $ids)
            ->whereBetween('created_at', [$from, $to]), 'added_by_id');

        $commissions = CommissionEntry::query()
            ->where('agency_id', $agencyId)
            ->whereIn('beneficiary_id', $ids)
            ->where('status', '!=', CommissionEntryStatus::Cancelled->value)
            ->whereBetween('earned_at', [$from, $to])
            ->toBase()
            ->selectRaw('beneficiary_id, SUM(amount) AS total')
            ->groupBy('beneficiary_id')
            ->pluck('total', 'beneficiary_id');

        // Propriétaire OU collaborateur `agent|manager` : l'UNION dédoublonne le bien que l'agent
        // possède et sur lequel il collabore aussi.
        $owned = Property::query()
            ->where('agency_id', $agencyId)
            ->whereIn('user_id', $ids)
            ->toBase()
            ->select(['id as property_id', 'user_id']);
        $collaborated = PropertyCollaborator::query()
            ->join('properties', 'properties.id', '=', 'property_collaborators.property_id')
            ->whereNull('properties.deleted_at')
            ->where('properties.agency_id', $agencyId)
            ->whereIn('property_collaborators.user_id', $ids)
            ->whereIn('property_collaborators.role', [CollaboratorRole::Agent->value, CollaboratorRole::Manager->value])
            ->toBase()
            ->select(['property_collaborators.property_id', 'property_collaborators.user_id']);
        $managed = DB::query()
            ->fromSub($owned->union($collaborated), 'managed')
            ->selectRaw('user_id, COUNT(*) AS n')
            ->groupBy('user_id')
            ->pluck('n', 'user_id');

        $overdue = $this->countBy(Task::query()
            ->whereIn('assigned_to_id', $ids)
            ->whereIn('status', [TaskStatus::Open->value, TaskStatus::InProgress->value])
            ->whereNotNull('due_at')
            ->where('due_at', '<', now()), 'assigned_to_id');

        return [
            'period' => $from->format('Y-m'),
            'agents' => $agents->map(function (AgentProfile $profile) use ($signed, $visits, $customers, $commissions, $managed, $overdue): array {
                $id = (int) $profile->user_id;
                $user = $profile->user;

                return [
                    'user_id' => $id,
                    'name' => $user ? (trim($user->first_name.' '.$user->last_name) ?: $user->username) : null,
                    'leases_signed' => (int) ($signed[$id]->leases ?? 0),
                    'sales_signed' => (int) ($signed[$id]->sales ?? 0),
                    'visits_completed' => (int) ($visits[$id] ?? 0),
                    'customers_added' => (int) ($customers[$id] ?? 0),
                    'commissions_earned' => round((float) ($commissions[$id] ?? 0), 2),
                    'properties_managed' => (int) ($managed[$id] ?? 0),
                    'tasks_overdue' => (int) ($overdue[$id] ?? 0),
                ];
            })->values()->all(),
        ];
    }

    /**
     * @param  Builder<Model>  $query
     * @return Collection<int|string, mixed>
     */
    private function countBy(Builder $query, string $column): Collection
    {
        return $query->toBase()
            ->selectRaw("{$column} AS grouped_by, COUNT(*) AS n")
            ->groupBy($column)
            ->pluck('n', 'grouped_by');
    }
}
