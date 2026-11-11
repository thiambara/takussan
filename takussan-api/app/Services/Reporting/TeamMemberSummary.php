<?php

namespace App\Services\Reporting;

use App\Http\Resources\Bases\BaseResource;
use App\Models\CommissionEntry;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2665 — ce que chaque membre de l'équipe porte dans l'agence (`include=team_summary` de
 * `GET /api/users`), et les comptes des pastilles (`meta.counts`).
 *
 * Une requête groupée par indicateur, quel que soit le nombre de membres de la page :
 *
 * - `properties_followed_count` : {@see TeamPerformanceService::propertiesManaged()}, la définition
 *   de `properties_managed` ;
 * - `commissions_due_amount` : la somme des lignes `due` du grand livre dont le membre est
 *   bénéficiaire dans l'agence — rendue seulement quand `$withCommissions` (le contrôleur en juge) ;
 * - `current_absence` : l'absence EN COURS, la règle de `TeamTodayService` (`absences()->active()`),
 *   le remplaçant nommé sans coordonnée ;
 * - `joined_at` : la création du premier profil du membre dans l'agence (agent, administrateur ou
 *   bailleur, supprimés compris : le passage d'agent à administrateur supprime le profil d'agent).
 */
final class TeamMemberSummary
{
    public function __construct(private readonly TeamPerformanceService $performance) {}

    /**
     * @param  list<int>  $userIds
     * @return array<int, array<string, mixed>>
     */
    public function for(int $agencyId, array $userIds, bool $withCommissions): array
    {
        if ($userIds === []) {
            return [];
        }

        $managed = $this->performance->propertiesManaged($agencyId, $userIds);
        $due = $withCommissions
            ? CommissionEntry::query()
                ->where('agency_id', $agencyId)
                ->whereIn('beneficiary_id', $userIds)
                ->where('status', CommissionEntryStatus::Due->value)
                ->toBase()
                ->selectRaw('beneficiary_id, SUM(amount) AS total')
                ->groupBy('beneficiary_id')
                ->pluck('total', 'beneficiary_id')
            : collect();
        // Deux absences actives d'un même membre ne devraient pas coexister (refus des
        // chevauchements, TCK-591) ; si c'était le cas, la plus lointaine l'emporte (`keyBy`).
        $absences = RoleDelegation::query()
            ->absences()
            ->active()
            ->where('agency_id', $agencyId)
            ->whereIn('replaces_user_id', $userIds)
            ->with('user:id,first_name,last_name,username')
            ->orderBy('ends_at')
            ->orderBy('id')
            ->get()
            ->keyBy('replaces_user_id');
        $joined = $this->joinedAt($agencyId, $userIds);

        $summary = [];
        foreach ($userIds as $id) {
            $absence = $absences[$id] ?? null;
            $row = ['properties_followed_count' => (int) ($managed[$id] ?? 0)];
            if ($withCommissions) {
                $row['commissions_due_amount'] = round((float) ($due[$id] ?? 0), 2);
            }
            $row['current_absence'] = $absence === null ? null : [
                'starts_at' => BaseResource::instantOnWire($absence->starts_at),
                'ends_at' => BaseResource::instantOnWire($absence->ends_at),
                'substitute' => $this->person($absence->user),
            ];
            $first = $joined[$id] ?? null;
            // Une colonne lue par `toBase()` sort en chaîne : relue dans le fuseau de l'application.
            $row['joined_at'] = $first !== null ? BaseResource::instantOnWire(Carbon::parse($first, config('app.timezone'))) : null;
            $summary[$id] = $row;
        }

        return $summary;
    }

    /**
     * Les comptes des pastilles, sur l'ensemble `$set` (la base de la liste et ses filtres, hors
     * `filter[role]`) : un membre qui tient deux profils compte dans les deux.
     *
     * @param  Builder<User>  $set
     * @return array{agent: int, agency_admin: int, owner: int, absent: int}
     */
    public function counts(Builder $set, int $agencyId): array
    {
        $inAgency = fn (Builder $p) => $p->where('agency_id', $agencyId);

        return [
            'agent' => (clone $set)->whereHas('agentProfiles', $inAgency)->count(),
            'agency_admin' => (clone $set)->whereHas('agencyAdminProfiles', $inAgency)->count(),
            'owner' => (clone $set)->whereHas('ownerProfiles', $inAgency)->count(),
            'absent' => (clone $set)->whereExists(fn ($q) => $q->selectRaw('1')
                ->from('role_delegations')
                ->whereColumn('role_delegations.replaces_user_id', 'users.id')
                ->where('role_delegations.agency_id', $agencyId)
                ->whereIn('role_delegations.id', RoleDelegation::query()->absences()->active()->select('id')))
                ->count(),
        ];
    }

    /**
     * @param  list<int>  $userIds
     * @return Collection<int|string, mixed>
     */
    private function joinedAt(int $agencyId, array $userIds): Collection
    {
        $profiles = collect([AgentProfile::class, AgencyAdminProfile::class, OwnerProfile::class])
            ->map(fn (string $class) => $class::withTrashed()
                ->where('agency_id', $agencyId)
                ->whereIn('user_id', $userIds)
                ->toBase()
                ->select(['user_id', 'created_at']));
        $union = $profiles->shift();
        foreach ($profiles as $query) {
            $union->unionAll($query);
        }

        return DB::query()
            ->fromSub($union, 'profils')
            ->selectRaw('user_id, MIN(created_at) AS joined_at')
            ->groupBy('user_id')
            ->pluck('joined_at', 'user_id');
    }

    /** @return array{id: int, name: string}|null */
    private function person(?User $user): ?array
    {
        return $user === null ? null : ['id' => (int) $user->id, 'name' => $user->nameWithoutContact()];
    }
}
