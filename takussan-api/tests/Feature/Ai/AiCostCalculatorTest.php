<?php

namespace Tests\Feature\Ai;

use App\Models\AiModel;
use App\Services\Ai\AiCostCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Laravel\Ai\Responses\Data\TextUsage;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\TestCase;

/**
 * TCK-2383, TCK-2448 (ADR-0086) — le coût se calcule en dollars depuis le tarif du catalogue, sans
 * perdre un chiffre ; un modèle sans tarif n'en invente pas.
 */
class AiCostCalculatorTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
    }

    public function test_each_token_kind_is_priced_at_its_own_rate(): void
    {
        // 800 000 non cachés × 2 $ + 200 000 lus en cache × 0,2 $ + 100 000 en sortie × 10 $
        // = 1,60 + 0,04 + 1,00 = 2,64 $.
        $usage = new TextUsage(inputTokens: 1_000_000, outputTokens: 100_000, cacheReadInputTokens: 200_000);

        $this->assertSame('2.64', app(AiCostCalculator::class)->estimate('anthropic', 'modele-a', $usage));
    }

    public function test_an_unpriced_model_costs_null_and_warns(): void
    {
        Log::spy();

        $this->assertNull(app(AiCostCalculator::class)->estimate('anthropic', 'inconnu', new TextUsage(10, 10)));
        Log::shouldHaveReceived('warning')->once()->with('ai.model_unpriced', ['provider' => 'anthropic', 'model' => 'inconnu']);
    }

    public function test_a_row_of_the_catalogue_replaces_the_configured_price(): void
    {
        AiModel::factory()->create(['model' => 'modele-a', 'input' => '7', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0']);

        $this->assertSame('7', app(AiCostCalculator::class)->estimate('anthropic', 'modele-a', new TextUsage(1_000_000, 500)));
    }

    public function test_a_withdrawn_model_is_still_counted_at_its_price(): void
    {
        AiModel::factory()->create(['model' => 'modele-retire', 'input' => '3', 'active' => false]);

        $this->assertSame('3', app(AiCostCalculator::class)->estimate('anthropic', 'modele-retire', new TextUsage(1_000_000, 0)));
    }

    /** AC8 — 7 × 4e-11 / 1e6 en `float` rend 2.7999999999999996E-16 : ici, le dernier chiffre tient. */
    public function test_a_tiny_price_keeps_every_digit(): void
    {
        AiModel::factory()->create(['model' => 'modele-infime', 'input' => '0.00000000004', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0']);

        $this->assertSame('0.00000000000000028', app(AiCostCalculator::class)->estimate('anthropic', 'modele-infime', new TextUsage(7, 0)));
    }

    /** AC5 — un tarif nul saisi est un tarif : l'appel coûte 0, sans alerte. */
    public function test_a_zero_price_costs_zero_without_warning(): void
    {
        Log::spy();
        AiModel::factory()->create(['model' => 'modele-gratuit', 'input' => '0', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0']);

        $this->assertSame('0', app(AiCostCalculator::class)->estimate('anthropic', 'modele-gratuit', new TextUsage(1000, 1000)));
        Log::shouldNotHaveReceived('warning');
    }
}
