<?php

namespace Tests\Feature\Ai;

use App\Models\AiModel;
use App\Models\AiRoleAssignment;
use App\Models\AiUsageSetting;
use App\Services\Ai\AiModelCatalogue;
use App\Services\Ai\AiProviderCatalogue;
use App\Services\Ai\ModelLink;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\TestCase;

/** TCK-2448 (ADR-0085 §1) — le catalogue est l'union de la base et de la configuration, la base l'emporte. */
class AiModelCatalogueTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private AiModelCatalogue $catalogue;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        $this->catalogue = app(AiModelCatalogue::class);
    }

    public function test_the_catalogue_is_the_union_of_the_configuration_and_the_rows(): void
    {
        AiModel::factory()->create(['model' => 'modele-neuf', 'input' => '3']);

        $entries = collect($this->catalogue->entries())->keyBy('model');

        $this->assertSame(['modele-a', 'modele-b', 'modele-neuf'], $entries->keys()->all());
        $this->assertSame(['config', true, '2'], [$entries['modele-a']['origin'], $entries['modele-a']['in_config'], $entries['modele-a']['input']]);
        $this->assertSame(['console', false, '3'], [$entries['modele-neuf']['origin'], $entries['modele-neuf']['in_config'], $entries['modele-neuf']['input']]);
    }

    public function test_a_row_wins_over_the_configuration_for_the_same_pair(): void
    {
        AiModel::factory()->create(['model' => 'modele-a', 'input' => '9']);

        $entry = collect($this->catalogue->entries())->firstWhere('model', 'modele-a');

        $this->assertSame(['console', true, '9'], [$entry['origin'], $entry['in_config'], $entry['input']]);
        $this->assertSame('9', $this->catalogue->priceOf('anthropic', 'modele-a')['input']);
    }

    public function test_a_row_withdraws_a_model_of_the_configuration_which_stays_listed(): void
    {
        AiModel::factory()->create(['model' => 'modele-a', 'active' => false]);

        $this->assertFalse((new ModelLink('anthropic', 'modele-a'))->isPriced());
        $this->assertFalse(collect($this->catalogue->entries())->firstWhere('model', 'modele-a')['active']);
        $this->assertSame(['modele-b'], $this->catalogue->assignableModels('anthropic'));
        $this->assertSame(['modele-b'], app(AiProviderCatalogue::class)->describe()[0]['models']);
    }

    public function test_a_zero_price_is_a_price(): void
    {
        AiModel::factory()->create(['model' => 'modele-gratuit', 'input' => '0', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0']);

        $this->assertTrue((new ModelLink('anthropic', 'modele-gratuit'))->isPriced());
        $this->assertSame('modele-gratuit', $this->catalogue->cheapestModel('anthropic'));
    }

    public function test_the_cheapest_model_is_judged_on_every_digit_and_never_a_withdrawn_one(): void
    {
        config(['ai.pricing.anthropic' => ['modele-a' => ['input' => '5', 'output' => '5', 'cache_read' => '0', 'cache_write' => '0']]]);
        AiModel::factory()->create(['model' => 'modele-c', 'input' => '0.30000000000000000003']);
        AiModel::factory()->create(['model' => 'modele-d', 'input' => '0.1', 'active' => false]);
        AiModel::factory()->create(['model' => 'modele-e', 'input' => '0.30000000000000000001']);

        $this->assertSame('modele-e', app(AiProviderCatalogue::class)->cheapestModel('anthropic'));
    }

    public function test_the_identifier_is_compared_exactly(): void
    {
        AiModel::factory()->create(['model' => 'Modele-Neuf']);

        $this->assertTrue((new ModelLink('anthropic', 'Modele-Neuf'))->isPriced());
        $this->assertFalse((new ModelLink('anthropic', 'modele-neuf'))->isPriced());
    }

    public function test_a_row_of_an_undeclared_provider_is_not_assignable_nor_listed(): void
    {
        AiModel::factory()->create(['provider' => 'ancien', 'model' => 'modele-a']);

        $this->assertFalse((new ModelLink('ancien', 'modele-a'))->isPriced());
        $this->assertNull(collect($this->catalogue->entries())->firstWhere('provider', 'ancien'));
    }

    public function test_the_uses_of_a_model_name_chains_forced_models_and_fallbacks(): void
    {
        AiRoleAssignment::query()->create(['role' => 'redaction', 'chain' => [['provider' => 'anthropic', 'model' => 'modele-b', 'max_tokens' => null]]]);
        AiUsageSetting::query()->create(['usage_key' => 'essai.usage', 'forced_provider' => 'anthropic', 'forced_model' => 'modele-b']);

        $this->assertSame(
            ['roles' => ['redaction'], 'usages' => ['essai.usage'], 'fallback_roles' => ['extraction']],
            $this->catalogue->usesOf('anthropic', 'modele-b'),
        );
        $this->assertSame(['roles' => [], 'usages' => [], 'fallback_roles' => []], $this->catalogue->usesOf('anthropic', 'modele-inemploye'));
    }
}
