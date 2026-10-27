<?php

namespace App\Http\Controllers\Api\Admin;

use App\Ai\Usages\RadarExtractionUsage;
use App\Http\Controllers\Base\Controller;
use App\Models\AiCall;
use App\Models\AiUsageSetting;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarListing;
use App\Services\Ai\AiBudget;
use App\Services\Ai\AiUsageRegistry;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2386 (ADR-0077) — la liste de travail du Radar en chiffres : les annonces par étape (toutes
 * les étapes, zéro compris), l'extraction en attente (`captured` avec un motif : budget, coupe-circuit,
 * fournisseurs en panne), et le coût IA du jour des usages `radar.*` rapporté à son plafond — celui
 * de la console (`ai_usage_settings`), à défaut celui de l'usage — et au plafond global. Évaluations
 * exclues, comme partout (`AiBudget`).
 */
class RadarDashboardController extends Controller
{
    public function __invoke(AiBudget $budget, AiUsageRegistry $registry): JsonResponse
    {
        $counts = RadarListing::query()
            ->selectRaw('stage, count(*) as total')
            ->groupBy('stage')
            ->pluck('total', 'stage');

        $stages = [];
        foreach (RadarListingStage::cases() as $stage) {
            $stages[$stage->value] = (int) ($counts[$stage->value] ?? 0);
        }

        $setting = AiUsageSetting::query()->where('usage_key', RadarExtractionUsage::KEY)->first();
        $cap = $setting?->daily_budget_xof ?? $registry->get(RadarExtractionUsage::KEY)->dailyBudgetXof();
        $global = config('ai.budgets.daily_global_xof');

        return $this->json(['data' => [
            'stages' => $stages,
            'pending_extraction' => RadarListing::query()
                ->where('stage', RadarListingStage::Captured)
                ->whereNotNull('stage_reason')
                ->count(),
            'ai' => [
                'spent_today_xof' => round((float) AiCall::query()
                    ->where('is_evaluation', false)
                    ->where('created_at', '>=', now()->startOfDay())
                    ->where('usage_key', 'like', 'radar.%')
                    ->sum('cost_estimate'), 2),
                'daily_budget_xof' => $cap === null ? null : (float) $cap,
                'global_spent_today_xof' => round($budget->spentToday(), 2),
                'global_daily_budget_xof' => $global === null ? null : (float) $global,
            ],
        ]]);
    }
}
