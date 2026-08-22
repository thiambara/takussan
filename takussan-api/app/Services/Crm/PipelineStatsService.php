<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;

/**
 * TCK-083 — Compute the pipeline metrics shown on `/app/crm/pipeline`.
 *
 * Scope rule (kept aligned with `CustomerController::index`):
 *   - admin / super_admin → unrestricted
 *   - agency members → all customers belonging to their agency, plus
 *     legacy rows they personally added before agency_id was attached
 *   - everyone else → only customers they personally added
 *
 * Pipeline widgets represent active CRM prospects, so terminal/customer
 * lifecycle archives are excluded by Customer.status.
 *
 * `avg_time_in_stage` and `stage_changes_last_30d` are derived from the
 * spatie activity log entries that already capture `pipeline_stage`
 * transitions on Customer (see Auditable + LogOptions in
 * {@see Customer::getActivitylogOptions}).
 */
class PipelineStatsService
{
    /**
     * @return array{
     *   stage_counts: array<string,int>,
     *   stage_changes_last_30d: int,
     *   avg_time_in_stage: array<string, float>,
     *   conversion_rate: float,
     * }
     */
    public function compute(User $user): array
    {
        $base = $this->scopedQuery($user);
        $customerIds = (clone $base)->pluck('id');

        return [
            'stage_counts' => $this->stageCounts($base),
            'stage_changes_last_30d' => $this->stageChangesLast30Days($customerIds),
            'avg_time_in_stage' => $this->avgTimeInStage($customerIds),
            'conversion_rate' => $this->conversionRate($customerIds),
        ];
    }

    /**
     * Scope used by the dashboard — mirrors CustomerController::index access
     * rules so the UI counts match the kanban content the user can actually
     * see.
     *
     * @return Builder<Customer>
     */
    protected function scopedQuery(User $user): Builder
    {
        $query = Customer::query()
            ->where('status', CustomerStatus::Active);

        if ($user->isSuperAdmin()) {
            return $query;
        }

        if ($user->agency_id) {
            return $query->where(function (Builder $inner) use ($user) {
                $inner
                    ->where('agency_id', $user->agency_id)
                    ->orWhere('added_by_id', $user->id);
            });
        }

        return $query->where('added_by_id', $user->id);
    }

    /**
     * @return array<string,int>
     */
    protected function stageCounts(Builder $base): array
    {
        $counts = (clone $base)
            ->selectRaw('pipeline_stage, COUNT(*) as total')
            ->groupBy('pipeline_stage')
            ->pluck('total', 'pipeline_stage')
            ->toArray();

        $result = [];
        foreach (CustomerPipelineStage::cases() as $stage) {
            $result[$stage->value] = (int) ($counts[$stage->value] ?? 0);
        }

        return $result;
    }

    /**
     * Les deux chemins JSON du journal d'activité, en SQL PostgreSQL.
     *
     * ⚠ Ces deux constantes remplacent un BRANCHEMENT PAR DRIVER qui était mort de
     * naissance, et c'est la trouvaille la plus instructive de la migration vers
     * PostgreSQL (ADR-0020).
     *
     * Il s'écrivait `$driver === 'sqlite' ? json_extract(…) : JSON_UNQUOTE(JSON_EXTRACT(…))`
     * — donc « SQLite, sinon MySQL ». Mais la suite de tests tournait sur SQLite et la
     * production n'a jamais servi (D-04) : **la branche MySQL n'a jamais été exécutée par
     * quoi que ce soit**, ni un test, ni une requête réelle. Elle aurait cassé sur
     * PostgreSQL — `JSON_UNQUOTE` n'y existe pas — et le rouge ne serait apparu qu'en
     * production, sur une console CRM.
     *
     * Le branchement est SUPPRIMÉ, pas ramené à une branche : laisser un ternaire à un
     * seul cas laisse croire qu'il en existe un second, et invite le suivant à le
     * « compléter » pour un moteur que le dépôt ne supporte plus.
     *
     * `->>` rend du TEXTE et déquote lui-même : il n'y a pas d'équivalent de
     * `JSON_UNQUOTE` à écrire, l'oublier donnerait des valeurs entourées de guillemets.
     * Les deux opérateurs valent sur `json` comme sur `jsonb`.
     */
    private const PIPELINE_STAGE_OLD = "properties->'old'->>'pipeline_stage'";

    private const PIPELINE_STAGE_NEW = "properties->'attributes'->>'pipeline_stage'";

    /**
     * Count of pipeline_stage transitions for the in-scope customers in the
     * last 30 days. Uses the spatie activity log (Auditable trait) which
     * tracks `pipeline_stage` in its `properties` JSON column.
     */
    protected function stageChangesLast30Days(Collection $customerIds): int
    {
        if ($customerIds->isEmpty()) {
            return 0;
        }

        return (int) Activity::query()
            ->where('subject_type', Customer::class)
            ->whereIn('subject_id', $customerIds)
            ->where('created_at', '>=', now()->subDays(30))
            ->whereRaw(self::PIPELINE_STAGE_NEW.' IS NOT NULL')
            ->count();
    }

    /**
     * Average time (in days) a customer spent in each stage, computed across
     * stage-change activity log entries within the in-scope set.
     *
     * @return array<string, float>
     */
    protected function avgTimeInStage(Collection $customerIds): array
    {
        $result = [];
        foreach (CustomerPipelineStage::cases() as $stage) {
            $result[$stage->value] = 0.0;
        }

        if ($customerIds->isEmpty()) {
            return $result;
        }

        $oldExpr = self::PIPELINE_STAGE_OLD;
        $newExpr = self::PIPELINE_STAGE_NEW;

        $rows = Activity::query()
            ->where('subject_type', Customer::class)
            ->whereIn('subject_id', $customerIds)
            ->whereRaw("{$newExpr} IS NOT NULL")
            ->orderBy('subject_id')
            ->orderBy('created_at')
            ->get([
                'subject_id',
                'created_at',
                DB::raw("{$oldExpr} as old_stage"),
                DB::raw("{$newExpr} as new_stage"),
            ]);

        $accum = [];
        foreach ($rows as $row) {
            $key = $row->subject_id;
            $previous = $accum[$key] ?? null;

            if ($previous && $row->old_stage) {
                $stage = (string) $row->old_stage;
                $diffDays = abs($previous['at']->diffInSeconds($row->created_at)) / 86400;
                $accum[$key.'_'.$stage]['durations'][] = $diffDays;
            }

            $accum[$key] = ['at' => $row->created_at];
        }

        $byStage = [];
        foreach ($accum as $key => $value) {
            if (! isset($value['durations'])) {
                continue;
            }
            [$_, $stage] = explode('_', $key, 2);
            foreach ($value['durations'] as $d) {
                $byStage[$stage][] = $d;
            }
        }

        foreach ($byStage as $stage => $durations) {
            if (! isset($result[$stage])) {
                continue;
            }
            $result[$stage] = round(array_sum($durations) / count($durations), 2);
        }

        return $result;
    }

    /**
     * Conversion rate over the last 30 days = converted / (converted + lost).
     * Both stages must be the **terminal** stage of a customer in the window
     * (i.e. their pipeline_stage right now). Returns 0.0 when no terminal
     * outcome exists yet.
     */
    protected function conversionRate(Collection $customerIds): float
    {
        if ($customerIds->isEmpty()) {
            return 0.0;
        }

        $since = now()->subDays(30);

        $converted = Customer::query()
            ->whereIn('id', $customerIds)
            ->where('pipeline_stage', CustomerPipelineStage::Converted)
            ->where('updated_at', '>=', $since)
            ->count();

        $lost = Customer::query()
            ->whereIn('id', $customerIds)
            ->where('pipeline_stage', CustomerPipelineStage::Lost)
            ->where('updated_at', '>=', $since)
            ->count();

        $total = $converted + $lost;
        if ($total === 0) {
            return 0.0;
        }

        return round($converted / $total, 4);
    }
}
