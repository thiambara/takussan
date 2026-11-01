<?php

namespace Tests\Feature\Api\Admin;

use App\Models\AiModel;
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
            'forced_provider' => 'anthropic', 'forced_model' => 'modele-b', 'daily_budget_usd' => '250',
        ])->assertOk()->json('data'))->firstWhere('key', UsageDEssai::KEY);

        $this->assertSame('modele-b', $usage['forced']['model']);
        $this->assertSame([['provider' => 'anthropic', 'model' => 'modele-b', 'max_tokens' => 1000]], $usage['chain']);
        $this->assertSame('250', $usage['daily_budget_usd']);
        $this->assertSame('250', AiUsageSetting::query()->sole()->daily_budget_usd);
    }

    /** TCK-2448 — le modèle forcé suit le catalogue : un modèle ajouté en base se force, un modèle retiré non. */
    public function test_a_forced_model_follows_the_catalogue(): void
    {
        $this->actingAsRole('super_admin');
        AiModel::factory()->create(['model' => 'modele-neuf']);
        AiModel::factory()->create(['model' => 'modele-retire', 'active' => false]);
        $url = '/api/admin/ai/usages/'.UsageDEssai::KEY;

        $this->patchJson($url, ['forced_provider' => 'anthropic', 'forced_model' => 'modele-neuf'])->assertOk();
        $this->patchJson($url, ['forced_provider' => 'anthropic', 'forced_model' => 'modele-retire'])->assertStatus(422)->assertJsonPath('code', 'ai.model_unpriced');
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

    /** @return array<string, mixed> */
    private function plafondAbaisseSansToucherAuForcage(string $provider, string $model): array
    {
        $this->actingAsRole('super_admin');
        AiUsageSetting::query()->create(['usage_key' => UsageDEssai::KEY, 'forced_provider' => $provider, 'forced_model' => $model, 'daily_budget_usd' => '50']);

        return $this->patchJson('/api/admin/ai/usages/'.UsageDEssai::KEY, [
            'forced_provider' => $provider, 'forced_model' => $model, 'daily_budget_usd' => '0.01',
        ])->assertOk()->json('data');
    }

    private function assertForcageIntactEtPlafondAbaisse(array $usages, string $provider, string $model): void
    {
        $setting = AiUsageSetting::query()->sole();
        $this->assertSame([$provider, $model, '0.01'], [$setting->forced_provider, $setting->forced_model, $setting->daily_budget_usd]);
        $this->assertSame('0.01', collect($usages)->firstWhere('key', UsageDEssai::KEY)['daily_budget_usd']);
    }

    /** Le plafond est le frein de sécurité : le modèle reste appelé, il doit toujours pouvoir s'abaisser (TCK-2448). */
    public function test_a_ceiling_can_be_lowered_when_the_forced_model_is_withdrawn(): void
    {
        AiModel::factory()->create(['model' => 'modele-retire', 'active' => false]);

        $this->assertForcageIntactEtPlafondAbaisse($this->plafondAbaisseSansToucherAuForcage('anthropic', 'modele-retire'), 'anthropic', 'modele-retire');
    }

    public function test_a_ceiling_can_be_lowered_when_the_forced_model_left_the_configuration(): void
    {
        $this->assertForcageIntactEtPlafondAbaisse($this->plafondAbaisseSansToucherAuForcage('anthropic', 'modele-sorti'), 'anthropic', 'modele-sorti');
    }

    public function test_a_ceiling_can_be_lowered_when_the_forced_provider_left_the_configuration(): void
    {
        $this->assertForcageIntactEtPlafondAbaisse($this->plafondAbaisseSansToucherAuForcage('fournisseur-sorti', 'modele-a'), 'fournisseur-sorti', 'modele-a');
    }

    /** Le couple en base passe, parce qu'il ne change pas. Tout autre se juge. */
    public function test_a_forcing_that_changes_is_still_judged(): void
    {
        $this->actingAsRole('super_admin');
        AiModel::factory()->create(['model' => 'modele-retire', 'active' => false]);
        AiUsageSetting::query()->create(['usage_key' => UsageDEssai::KEY, 'forced_provider' => 'anthropic', 'forced_model' => 'modele-a']);
        $url = '/api/admin/ai/usages/'.UsageDEssai::KEY;

        $this->patchJson($url, ['forced_provider' => 'anthropic', 'forced_model' => 'modele-retire'])->assertStatus(422)->assertJsonPath('code', 'ai.model_unpriced');
        $this->patchJson($url, ['forced_provider' => 'fournisseur-sorti', 'forced_model' => 'modele-a'])->assertStatus(422)->assertJsonValidationErrors('forced_provider');

        // Le couple comparé est le couple : même modèle, autre fournisseur, et l'inverse.
        AiUsageSetting::query()->sole()->update(['forced_provider' => 'fournisseur-sorti']);
        $this->patchJson($url, ['forced_provider' => 'fournisseur-sorti', 'forced_model' => 'modele-b'])->assertStatus(422)->assertJsonValidationErrors('forced_provider');

        $setting = AiUsageSetting::query()->sole();
        $this->assertSame(['fournisseur-sorti', 'modele-a'], [$setting->forced_provider, $setting->forced_model]);
    }

    /** TCK-2423 + TCK-2450 — une clé sans la déclaration du refus de l'entraînement ne se force pas : à ce fournisseur, rien ne part. */
    public function test_voyage_sans_la_declaration_ne_se_force_pas(): void
    {
        $this->actingAsRole('super_admin');
        config(['ai.providers.voyageai.key' => 'k', 'ai.providers.voyageai.training_opt_out' => false, 'ai.pricing.voyageai' => ['modele-v' => ['input' => '1', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0']]]);

        $this->patchJson('/api/admin/ai/usages/'.UsageDEssai::KEY, ['forced_provider' => 'voyageai', 'forced_model' => 'modele-v'])
            ->assertStatus(422)->assertJsonValidationErrors(['forced_provider' => __('errors.ai.provider_unreachable')]);
        $this->assertSame(0, AiUsageSetting::query()->whereNotNull('forced_provider')->count());
    }

    public function test_un_usage_de_texte_ne_force_pas_un_fournisseur_dembeddings(): void
    {
        $this->actingAsRole('super_admin');
        config(['ai.providers.voyageai.key' => 'k', 'ai.providers.voyageai.training_opt_out' => true, 'ai.pricing.voyageai' => ['modele-v' => ['input' => '1', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0']]]);

        $this->patchJson('/api/admin/ai/usages/'.UsageDEssai::KEY, ['forced_provider' => 'voyageai', 'forced_model' => 'modele-v'])
            ->assertStatus(422)->assertJsonPath('code', 'ai.provider_role_mismatch');
    }
}
