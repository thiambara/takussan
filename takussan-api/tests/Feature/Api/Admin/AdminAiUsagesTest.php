<?php

namespace Tests\Feature\Api\Admin;

use App\Models\AiUsageSetting;
use App\Models\Enums\AiRefusalReason;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\Exceptions\AiRefused;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\Ai\AgentDEssai;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/** TCK-2385 — coupe-circuit, modèle forcé et plafond d'un usage, depuis la console. */
class AdminAiUsagesTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
    }

    public function test_the_usages_are_listed_with_their_effective_settings(): void
    {
        $this->actingAsRole('super_admin');

        $usage = collect($this->getJson('/api/admin/ai/usages')->assertOk()->json('data'))->firstWhere('key', UsageDEssai::KEY);

        $this->assertSame(['extraction', 'publique', true, null], [$usage['role'], $usage['max_data_class'], $usage['enabled'], $usage['forced']]);
        $this->assertSame('modele-a', $usage['chain'][0]['model']);
    }

    public function test_the_kill_switch_set_in_the_console_stops_the_next_call(): void
    {
        $operateur = $this->actingAsRole('super_admin');
        AgentDEssai::fake();

        $this->patchJson('/api/admin/ai/usages/'.UsageDEssai::KEY, ['enabled' => false])->assertOk();

        try {
            app(AiGateway::class)->run(new AiRequest(UsageDEssai::KEY, 'x', actor: $operateur));
            $this->fail('l\'usage coupé devait refuser');
        } catch (AiRefused $refus) {
            $this->assertSame(AiRefusalReason::KillSwitch, $refus->reason);
        }
        $journal = Activity::query()->where('event', 'super_admin_ai_usage_updated')->sole();
        $this->assertTrue($journal->properties['before']['enabled']);
        $this->assertFalse($journal->properties['after']['enabled']);
    }

    public function test_a_forced_model_and_a_ceiling_are_stored(): void
    {
        $this->actingAsRole('super_admin');

        $usage = collect($this->patchJson('/api/admin/ai/usages/'.UsageDEssai::KEY, [
            'forced_provider' => 'anthropic', 'forced_model' => 'modele-b', 'daily_budget_xof' => 250,
        ])->assertOk()->json('data'))->firstWhere('key', UsageDEssai::KEY);

        $this->assertSame('modele-b', $usage['forced']['model']);
        $this->assertSame([['provider' => 'anthropic', 'model' => 'modele-b', 'max_tokens' => 1000]], $usage['chain']);
        $this->assertEquals(250, $usage['daily_budget_xof']);
        $this->assertSame('250.00', AiUsageSetting::query()->sole()->daily_budget_xof);
    }

    public function test_an_unpriced_forced_model_and_an_unknown_usage_are_refused(): void
    {
        $this->actingAsRole('super_admin');

        $this->patchJson('/api/admin/ai/usages/'.UsageDEssai::KEY, ['forced_provider' => 'anthropic', 'forced_model' => 'inconnu'])->assertStatus(422)->assertJsonPath('code', 'ai.model_unpriced');
        $this->patchJson('/api/admin/ai/usages/inconnu.usage', ['enabled' => false])->assertStatus(404)->assertJsonPath('code', 'ai.usage_unknown');
    }

    public function test_clearing_the_forced_model_clears_both_halves_and_a_half_link_is_refused(): void
    {
        $this->actingAsRole('super_admin');
        $url = '/api/admin/ai/usages/'.UsageDEssai::KEY;
        $this->patchJson($url, ['forced_provider' => 'anthropic', 'forced_model' => 'modele-b'])->assertOk();

        $this->patchJson($url, ['forced_model' => null])->assertOk();
        $setting = AiUsageSetting::query()->sole();
        $this->assertNull($setting->forced_model);
        $this->assertNull($setting->forced_provider);

        $this->patchJson($url, ['forced_model' => 'modele-b'])->assertStatus(422)->assertJsonValidationErrors('forced_provider');
        $this->patchJson($url, ['forced_provider' => 'anthropic'])->assertStatus(422)->assertJsonValidationErrors('forced_model');
        $this->patchJson($url, ['forced_provider' => 'anthropic', 'forced_model' => null])->assertStatus(422)->assertJsonValidationErrors('forced_model');
        $this->assertNull(AiUsageSetting::query()->sole()->forced_provider);

        $this->patchJson($url, ['forced_provider' => 'anthropic', 'forced_model' => 'modele-b'])->assertOk();
        $this->patchJson($url, ['forced_provider' => null])->assertOk();
        $setting = AiUsageSetting::query()->sole();
        $this->assertSame([null, null], [$setting->forced_provider, $setting->forced_model]);
    }
}
