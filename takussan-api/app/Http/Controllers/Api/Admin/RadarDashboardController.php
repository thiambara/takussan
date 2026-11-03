<?php

namespace App\Http\Controllers\Api\Admin;

use App\Ai\Usages\RadarExtractionUsage;
use App\Http\Controllers\Base\Controller;
use App\Models\AiUsageSetting;
use App\Models\Enums\RadarListingStage;
use App\Models\RadarListing;
use App\Services\Ai\AiBudget;
use App\Services\Ai\AiMoney;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Radar\RadarFollowUps;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2386 (ADR-0077) — la liste de travail du Radar en chiffres : les annonces par étape (toutes
 * les étapes, zéro compris), l'extraction en attente (`captured` avec un motif : budget, coupe-circuit,
 * fournisseurs en panne), et le coût IA du jour des usages `radar.*` rapporté à son plafond — celui
 * de la console (`ai_usage_settings`), à défaut celui de l'usage — et au plafond global. Évaluations
 * exclues, comme partout (`AiBudget`). TCK-2388 : les relances dues et les messages en attente (`RadarFollowUps`).
 */
class RadarDashboardController extends Controller
{
    public function __invoke(AiBudget $budget, AiUsageRegistry $registry, RadarFollowUps $followUps): JsonResponse
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
        $cap = $setting?->daily_budget_usd ?? $registry->get(RadarExtractionUsage::KEY)->dailyBudgetUsd();
        $global = config('ai.budgets.daily_global_usd');

        return $this->json(['data' => [
            'stages' => $stages,
            'pending_extraction' => RadarListing::query()
                ->where('stage', RadarListingStage::Captured)
                ->whereNotNull('stage_reason')
                ->count(),
            // TCK-2388 (décision 4) — annonceurs distincts à relancer, et messages envoyés qui attendent encore.
            'follow_ups_due' => $followUps->due()->distinct()->count('radar_outreaches.radar_advertiser_id'),
            'outreaches_awaiting' => $followUps->awaiting()->count(),
            'ai' => [
                'spent_today_usd' => $budget->spentTodayForPrefix('radar.'),
                'daily_budget_usd' => $cap === null ? null : AiMoney::canonical((string) $cap),
                'global_spent_today_usd' => $budget->spentToday(),
                'global_daily_budget_usd' => $global === null ? null : AiMoney::canonical((string) $global),
                'usd_to_xof' => (string) config('ai.usd_to_xof'),
            ],
        ]]);
    }
}
