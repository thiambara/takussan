<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\AiDashboardRequest;
use App\Models\AiCall;
use App\Services\Ai\AiBudget;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiMoney;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\SuggestionRecorder;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2385 (ADR-0076 §12) — ce qui tourne et ce que ça coûte : par usage et par jour, hors
 * évaluations. `calls` compte les appels servis (réponse ou cache) ; refus, bascules et erreurs ont
 * leur colonne. `provider_rejections` compte les maillons qu'un autre fournisseur qu'Anthropic a refusés, et
 * que le secours a effacés (TCK-2449) : sans lui, ce fournisseur cassé ne se verrait plus.
 */
class AiDashboardController extends Controller
{
    public function __invoke(AiDashboardRequest $request, SuggestionRecorder $suggestions, EvaluationRunner $runner, AiUsageRegistry $registry, AiBudget $budget): JsonResponse
    {
        $from = CarbonImmutable::createFromFormat('Y-m-d', $request->validated('from'))->startOfDay();
        $to = CarbonImmutable::createFromFormat('Y-m-d', $request->validated('to'))->endOfDay();

        $days = AiCall::query()
            ->where('is_evaluation', false)
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw("usage_key, date(created_at) as day,
                count(*) filter (where outcome in ('success', 'cache_hit')) as calls,
                coalesce(sum(cost_estimate_usd), 0) as cost,
                avg(duration_ms) filter (where outcome = 'success') as avg_ms,
                count(*) filter (where outcome = 'error') as errors,
                count(*) filter (where outcome = 'refused') as refusals,
                count(*) filter (where outcome = 'failed_over') as failovers,
                count(*) filter (where outcome = 'cache_hit') as cache_hits,
                count(*) filter (where warning = ?) as provider_rejections", [AiGateway::WARNING_PROVIDER_REJECTED])
            ->groupByRaw('usage_key, date(created_at)')
            ->orderByRaw('date(created_at), usage_key')
            ->get()
            ->map(fn ($row): array => [
                'date' => (string) $row->day,
                'usage_key' => $row->usage_key,
                'calls' => (int) $row->calls,
                'cost_usd' => AiMoney::canonical((string) $row->cost),
                'avg_duration_ms' => $row->avg_ms !== null ? (int) round((float) $row->avg_ms) : null,
                'errors' => (int) $row->errors,
                'refusals' => (int) $row->refusals,
                'failovers' => (int) $row->failovers,
                'cache_hits' => (int) $row->cache_hits,
                'provider_rejections' => (int) $row->provider_rejections,
            ])->all();

        $baselines = [];
        foreach (array_keys($registry->all()) as $key) {
            if (($baseline = $runner->baseline($key)) === null) {
                continue;
            }
            // TCK-2386 — une référence sans jeu complet (sections de rôle seules) se montre par la
            // section du rôle de l'usage, à défaut la première : jamais un global absent.
            $section = $baseline['roles'][$registry->get($key)->role()->value] ?? (is_array($baseline['roles'] ?? null) ? reset($baseline['roles']) : null);
            if (! isset($baseline['global']) && is_array($section) && isset($section['global'])) {
                $baseline = ['global' => $section['global'], 'model' => $section['model'] ?? null] + $baseline;
            }
            if (isset($baseline['global'])) {
                $baselines[$key] = $baseline;
            }
        }

        $global = config('ai.budgets.daily_global_usd');

        return $this->json(['data' => [
            'days' => $days,
            'acceptance' => $suggestions->acceptanceRates($from, $to),
            'baselines' => $baselines,
            'today' => ['spent_usd' => $budget->spentToday(), 'daily_budget_usd' => $global === null ? null : AiMoney::canonical((string) $global)],
            'usd_to_xof' => (string) config('ai.usd_to_xof'),
        ]]);
    }
}
