<?php

namespace App\Services\Ai;

use App\Models\AiCall;
use App\Models\AiUsageSetting;
use Closure;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-2383, TCK-2448 (ADR-0076 §5, ADR-0086) — les plafonds journaliers, en dollars : global
 * (`config`), par usage (console, à défaut l'usage), par agence (`config`). La somme se fait en SQL et
 * la comparaison par `bccomp` : ni l'une ni l'autre ne passe par un `float`, et le taux `usd_to_xof`
 * n'entre pas ici. Une évaluation n'y compte pas : elle se lance la nuit et ne doit pas épuiser la
 * journée de production.
 */
final class AiBudget
{
    public function exhausted(AiUsage $usage, ?AiUsageSetting $setting, ?int $agencyId): bool
    {
        $global = config('ai.budgets.daily_global_usd');
        if ($global !== null && AiMoney::compare($this->spent(), (string) $global) >= 0) {
            return true;
        }

        $forUsage = $setting?->daily_budget_usd ?? $usage->dailyBudgetUsd();
        if ($forUsage !== null && AiMoney::compare($this->spentToday($usage->key()), (string) $forUsage) >= 0) {
            return true;
        }

        $perAgency = config('ai.budgets.daily_per_agency_usd');

        return $agencyId !== null && $perAgency !== null
            && AiMoney::compare($this->spent(fn (Builder $query) => $query->where('agency_id', $agencyId)), (string) $perAgency) >= 0;
    }

    public function spentToday(?string $usageKey = null): string
    {
        return $this->spent($usageKey === null ? null : fn (Builder $query) => $query->where('usage_key', $usageKey));
    }

    /**
     * TCK-2386 — la dépense du jour d'une famille d'usages (`radar.`), hors évaluations, à la même
     * règle que les plafonds : le tableau de bord du Radar ne recompte pas à sa façon.
     */
    public function spentTodayForPrefix(string $prefix): string
    {
        $pattern = addcslashes($prefix, '\\%_').'%';

        return $this->spent(fn (Builder $query) => $query->where('usage_key', 'like', $pattern));
    }

    private function spent(?Closure $scope = null): string
    {
        return AiMoney::canonical((string) AiCall::query()
            ->where('is_evaluation', false)
            ->where('created_at', '>=', now()->startOfDay())
            ->when($scope, $scope)
            ->sum('cost_estimate_usd'));
    }
}
