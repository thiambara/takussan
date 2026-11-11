<?php

namespace App\Services\Crm;

use App\Http\Requests\Api\PipelineStatsRequest;
use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;

/**
 * TCK-083 — Compute the pipeline metrics shown on `/app/crm/pipeline`.
 *
 * Scope rule: `Customer::scopeVisibleTo()` (TCK-591 §9), shared with
 * `CustomerController::index` — the rule of `CustomerPolicy::view`.
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
     * TCK-2591 — `$scope` : `mine` (mes fiches de référent, `filter[referent]=me` de TCK-2588),
     * `agency` (le CRM de l'agence active, `crm.view_all` vérifié par `PipelineStatsRequest`) ou
     * `null` (la lecture de la fiche, comme avant). `$request` porte les filtres de la liste
     * (`referent`, `tags`, `search`, `follow_up`…), appliqués par `Customer::buildQuery` : une
     * définition, la liste et ses chiffres ne divergent pas.
     *
     * @return array{
     *   scope: string|null,
     *   stage_counts: array<string,int>,
     *   stage_changes_last_30d: int,
     *   avg_time_in_stage: array<string, float>,
     *   median_days_in_stage: array<string, float|null>,
     *   conversion_rate: float,
     *   exits_last_30d: array{converted: int, lost: int},
     * }
     */
    public function compute(User $user, ?Request $request = null, ?string $scope = null): array
    {
        $base = $this->scopedQuery($user, $request ?? request(), $scope);
        $customerIds = (clone $base)->pluck('customers.id');
        $durations = $this->durationsInStage($customerIds);
        $exits = $this->exitsLast30Days($customerIds);
        $sorties = $exits['converted'] + $exits['lost'];

        return [
            'scope' => $scope,
            'stage_counts' => $this->stageCounts($base),
            'stage_changes_last_30d' => $this->stageChangesLast30Days($customerIds),
            'avg_time_in_stage' => array_map(
                fn (array $d) => $d === [] ? 0.0 : round(array_sum($d) / count($d), 2),
                $durations,
            ),
            'median_days_in_stage' => array_map(fn (array $d) => $d === [] ? null : self::median($d), $durations),
            // TCK-2591 (ADR-0103 § 6) — sorties DATÉES par le journal, jamais `updated_at`.
            'conversion_rate' => $sorties === 0 ? 0.0 : round($exits['converted'] / $sorties, 4),
            'exits_last_30d' => $exits,
        ];
    }

    /**
     * Les fiches que les chiffres lisent : la lecture de la fiche (`Customer::visibleTo`, la règle
     * de `CustomerController::index`), les fiches actives, la portée, puis les filtres de la liste.
     * Réduit à une liste d'identifiants : `fields`, `sort` ou `include` de la requête ne peuvent pas
     * déranger un `GROUP BY`.
     *
     * @return Builder<Customer>
     */
    protected function scopedQuery(User $user, Request $request, ?string $scope = null): Builder
    {
        // TCK-591 §9 — la portée de `CustomerController::index` (`Customer::scopeVisibleTo`).
        $base = Customer::query()
            ->visibleTo($user)
            ->where('customers.status', CustomerStatus::Active);

        // TCK-2591 — « Agence » : les seules fiches de l'agence active ; les ajouts de l'appelant
        // hors agence (ou d'une autre agence) que `visibleTo` lui laisse n'y entrent pas.
        if ($scope === PipelineStatsRequest::AGENCY && ($agencyId = $user->staffAgencyId()) !== null) {
            $base->where('customers.agency_id', $agencyId);
        }

        // TCK-2591 — « Moi » : `filter[referent]=me`, le filtre même de la liste (TCK-2588).
        if ($scope === PipelineStatsRequest::MINE) {
            $query = $request->query->all();
            $query['filter'] = (is_array($query['filter'] ?? null) ? $query['filter'] : []) + ['referent' => 'me'];
            // Une requête NEUVE, pas `duplicate()` : un FormRequest validé porte ses paramètres dans
            // sa source d'entrée (`replace()` de `BaseFormRequest`), que spatie lit avant la query
            // string — le filtre ajouté y serait masqué dès qu'un autre filtre est passé.
            $resolver = $request->getUserResolver();
            $request = Request::create('/', 'GET', $query);
            $request->setUserResolver($resolver);
        }

        $ids = Customer::buildQuery($base, $request)
            ->getEloquentBuilder()
            ->reorder()
            ->select('customers.id');

        return Customer::query()->whereIn('customers.id', $ids);
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
     *
     * ⚠ La colonne est `attribute_changes`, pas `properties` (P56.01) : activitylog v5 y
     * écrit le diff d'un événement de modèle (`old`, `attributes`) et laisse `properties` à
     * ce qu'écrit `withProperties()`, donc `[]` ici. Lire `properties` rendait 0 pour toujours.
     */
    private const PIPELINE_STAGE_OLD = "attribute_changes->'old'->>'pipeline_stage'";

    private const PIPELINE_STAGE_NEW = "attribute_changes->'attributes'->>'pipeline_stage'";

    /**
     * Count of pipeline_stage transitions for the in-scope customers in the
     * last 30 days. Uses the spatie activity log (Auditable trait), whose
     * `attribute_changes` JSON column carries the `pipeline_stage` diff.
     *
     * The `created` row also carries `attributes.pipeline_stage`: only rows with
     * a previous stage (`old`) are transitions.
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
            ->whereRaw(self::PIPELINE_STAGE_OLD.' IS NOT NULL')
            ->count();
    }

    /**
     * Les durées (en jours) passées dans chaque étape, tirées du journal : de l'entrée dans l'étape
     * (la ligne qui la pose, création comprise) à la ligne suivante qui en sort. Une fiche encore
     * dans l'étape n'a pas de durée close : elle n'y compte pas. Une passe, deux statistiques
     * (`avg_time_in_stage`, gardée pour compatibilité, et `median_days_in_stage`, TCK-2591).
     *
     * @return array<string, list<float>>
     */
    protected function durationsInStage(Collection $customerIds): array
    {
        $result = [];
        foreach (CustomerPipelineStage::cases() as $stage) {
            $result[$stage->value] = [];
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
            ->orderBy('id')
            ->get([
                'subject_id',
                'created_at',
                DB::raw("{$oldExpr} as old_stage"),
                DB::raw("{$newExpr} as new_stage"),
            ]);

        $entered = [];
        foreach ($rows as $row) {
            $key = (int) $row->subject_id;
            $previous = $entered[$key] ?? null;

            if ($previous !== null && $row->old_stage !== null && isset($result[(string) $row->old_stage])) {
                $result[(string) $row->old_stage][] = abs($previous->diffInSeconds($row->created_at)) / 86400;
            }

            $entered[$key] = $row->created_at;
        }

        return $result;
    }

    /** @param  non-empty-list<float>  $values */
    private static function median(array $values): float
    {
        sort($values);
        $n = count($values);
        $middle = intdiv($n, 2);

        return round($n % 2 === 1 ? $values[$middle] : ($values[$middle - 1] + $values[$middle]) / 2, 2);
    }

    /**
     * TCK-2591 (ADR-0103 § 6) — les entrées en `converted` et en `lost` des 30 derniers jours,
     * lues dans le journal des étapes : une ligne dont `attributes.pipeline_stage` est l'étape et
     * dont l'ancienne étape diffère (une fiche CRÉÉE dans l'étape y entre aussi). Une retouche
     * d'une fiche gagnée il y a 60 jours (téléphone, note…) n'écrit pas `pipeline_stage` : elle ne
     * compte plus, alors que l'ancien calcul lisait `updated_at`.
     *
     * @return array{converted: int, lost: int}
     */
    protected function exitsLast30Days(Collection $customerIds): array
    {
        $exits = ['converted' => 0, 'lost' => 0];
        if ($customerIds->isEmpty()) {
            return $exits;
        }

        $newExpr = self::PIPELINE_STAGE_NEW;
        $oldExpr = self::PIPELINE_STAGE_OLD;

        Activity::query()
            ->where('subject_type', Customer::class)
            ->whereIn('subject_id', $customerIds)
            ->where('created_at', '>=', now()->subDays(30))
            ->whereRaw("{$newExpr} IN (?, ?)", [CustomerPipelineStage::Converted->value, CustomerPipelineStage::Lost->value])
            ->whereRaw("{$oldExpr} IS DISTINCT FROM {$newExpr}")
            ->selectRaw("{$newExpr} as stage, COUNT(*) as total")
            ->groupBy(DB::raw($newExpr))
            ->get()
            ->each(function ($row) use (&$exits): void {
                $exits[(string) $row->stage] = (int) $row->total;
            });

        return $exits;
    }
}
