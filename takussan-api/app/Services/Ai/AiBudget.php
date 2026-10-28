<?php

namespace App\Services\Ai;

use App\Models\AiCall;
use App\Models\AiUsageSetting;
use Closure;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2383 (ADR-0076 §5) — les plafonds journaliers, en XOF : global (`config`), par usage
 * (console, à défaut l'usage), par agence (`config`). Une évaluation n'y compte pas : elle se lance
 * la nuit et ne doit pas épuiser la journée de production.
 */
final class AiBudget
{
    public function exhausted(AiUsage $usage, ?AiUsageSetting $setting, ?int $agencyId): bool
    {
        $global = config('ai.budgets.daily_global_xof');
        if ($global !== null && $this->spent() >= (float) $global) {
            return true;
        }

        $forUsage = $setting?->daily_budget_xof ?? $usage->dailyBudgetXof();
        if ($forUsage !== null && $this->spentToday($usage->key()) >= (float) $forUsage) {
            return true;
        }

        $perAgency = config('ai.budgets.daily_per_agency_xof');

        return $agencyId !== null && $perAgency !== null
            && $this->spent(fn (Builder $query) => $query->where('agency_id', $agencyId)) >= (float) $perAgency;
    }

    public function spentToday(?string $usageKey = null): float
    {
        return $this->spent($usageKey === null ? null : fn (Builder $query) => $query->where('usage_key', $usageKey));
    }

    /**
     * TCK-2386 — la dépense du jour d'une famille d'usages (`radar.`), hors évaluations, à la même
     * règle que les plafonds : le tableau de bord du Radar ne recompte pas à sa façon.
     */
    public function spentTodayForPrefix(string $prefix): float
    {
        $pattern = addcslashes($prefix, '\\%_').'%';

        return $this->spent(fn (Builder $query) => $query->where('usage_key', 'like', $pattern));
    }

    private function spent(?Closure $scope = null): float
    {
        return (float) AiCall::query()
            ->where('is_evaluation', false)
            ->where('created_at', '>=', now()->startOfDay())
            ->when($scope, $scope)
            ->sum('cost_estimate');
    }
}
