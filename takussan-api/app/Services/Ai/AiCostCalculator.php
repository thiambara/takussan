<?php

namespace App\Services\Ai;

use Illuminate\Support\Facades\Log;
use Laravel\Ai\Responses\Data\TextUsage;

/**
 * TCK-2383, TCK-2448 (ADR-0086) — le coût estimé d'un appel, en dollars, depuis le tarif du catalogue
 * (dollars par million de tokens). Chaque sorte de token a son tarif : entrée non cachée, lue en cache,
 * écrite en cache, sortie. Le résultat garde tous ses chiffres : l'échelle est celle du tarif, plus 6
 * pour la division par un million. Le taux `usd_to_xof` n'entre pas ici.
 */
final class AiCostCalculator
{
    public function __construct(private readonly AiModelCatalogue $catalogue) {}

    public function estimate(string $provider, string $model, TextUsage $usage): ?string
    {
        $price = $this->catalogue->priceOf($provider, $model);
        if ($price === null) {
            Log::warning('ai.model_unpriced', ['provider' => $provider, 'model' => $model]);

            return null;
        }

        $tokens = [
            'input' => $usage->uncachedInputTokens(),
            'cache_read' => $usage->cacheReadInputTokens ?? 0,
            'cache_write' => $usage->cacheWriteInputTokens ?? 0,
            'output' => $usage->outputTokens,
        ];
        $scale = max(array_map(AiMoney::scale(...), $price));
        $total = AiMoney::ZERO;
        foreach ($tokens as $kind => $count) {
            $total = bcadd($total, bcmul((string) $count, $price[$kind], $scale), $scale);
        }

        return AiMoney::canonical(bcdiv($total, '1000000', $scale + 6));
    }
}
