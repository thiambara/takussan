<?php

namespace Tests\Feature\Ai;

use App\Services\Ai\AiCostCalculator;
use Illuminate\Support\Facades\Log;
use Laravel\Ai\Responses\Data\TextUsage;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\TestCase;

/** TCK-2383 — le coût se calcule depuis la table de tarifs ; un modèle sans tarif n'en invente pas. */
class AiCostCalculatorTest extends TestCase
{
    use SocleIaDEssai;

    public function test_each_token_kind_is_priced_at_its_own_rate_then_converted(): void
    {
        $this->installerSocleDEssai();
        // 800 000 non cachés × 2 $ + 200 000 lus en cache × 0,2 $ + 100 000 en sortie × 10 $
        // = 1,60 + 0,04 + 1,00 = 2,64 $ ; × 600 = 1 584 XOF.
        $usage = new TextUsage(inputTokens: 1_000_000, outputTokens: 100_000, cacheReadInputTokens: 200_000);

        $this->assertSame(1584.0, app(AiCostCalculator::class)->estimate('anthropic', 'modele-a', $usage));
    }

    public function test_an_unpriced_model_costs_null_and_warns(): void
    {
        $this->installerSocleDEssai();
        Log::spy();

        $this->assertNull(app(AiCostCalculator::class)->estimate('anthropic', 'inconnu', new TextUsage(10, 10)));
        Log::shouldHaveReceived('warning')->once()->with('ai.model_unpriced', ['provider' => 'anthropic', 'model' => 'inconnu']);
    }
}
