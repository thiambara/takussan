<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Log;
use Laravel\Ai\Responses\Data\TextUsage;

/**
 * TCK-2383 — le coût estimé d'un appel, en XOF, depuis `config('ai.pricing')` (USD par million de
 * tokens) et `config('ai.usd_to_xof')`. Chaque sorte de token a son tarif : entrée non cachée, lue
 * en cache, écrite en cache, sortie.
 */
final class AiCostCalculator
{
    public function estimate(string $provider, string $model, TextUsage $usage): ?float
    {
        $price = config('ai.pricing')[$provider][$model] ?? null;
        if ($price === null) {
            Log::warning('ai.model_unpriced', ['provider' => $provider, 'model' => $model]);

            return null;
        }

        $usd = ($usage->uncachedInputTokens() * $price['input']
            + ($usage->cacheReadInputTokens ?? 0) * $price['cache_read']
            + ($usage->cacheWriteInputTokens ?? 0) * $price['cache_write']
            + $usage->outputTokens * $price['output']) / 1_000_000;

        return round($usd * (float) config('ai.usd_to_xof'), 2);
    }
}
