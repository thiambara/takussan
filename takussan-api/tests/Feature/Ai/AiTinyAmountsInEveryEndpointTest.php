<?php

namespace Tests\Feature\Ai;

use App\Models\AiCall;
use App\Models\AiModel;
use App\Models\AiUsageSetting;
use App\Services\Ai\AiUsageRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\Support\Ai\UsagePlafonneeDEssai;
use Tests\TestCase;

/**
 * TCK-2448 (ADR-0086) — chaque endpoint qui rend un coût, un tarif ou un plafond le rend au dernier chiffre.
 * Un arrondi sur un seul champ passait la garde et tous les tests : un montant ordinaire ne le voit pas.
 * Le coût du rapport d'évaluation se lit dans `AdminAiEvaluationsTest`.
 */
class AiTinyAmountsInEveryEndpointTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private const INFIME = '0.00000000004';

    private const PLAFOND_DECLARE = '0.00000000003';

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        $this->actingAsRole('super_admin');
    }

    public function test_usages_give_every_amount_to_the_last_digit(): void
    {
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry([UsageDEssai::class, UsagePlafonneeDEssai::class]));
        AiUsageSetting::query()->create(['usage_key' => UsageDEssai::KEY, 'daily_budget_usd' => self::INFIME]);
        AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success', 'cost_estimate_usd' => self::INFIME]);

        $usages = collect($this->getJson('/api/admin/ai/usages')->assertOk()->json('data'))->keyBy('key');

        $this->assertSame(self::INFIME, $usages[UsageDEssai::KEY]['daily_budget_usd']);
        $this->assertSame(self::INFIME, $usages[UsageDEssai::KEY]['spent_today_usd']);
        $this->assertSame(self::PLAFOND_DECLARE, $usages[UsagePlafonneeDEssai::KEY]['daily_budget_usd']);
        $this->assertSame(self::PLAFOND_DECLARE, $usages[UsagePlafonneeDEssai::KEY]['default_daily_budget_usd']);
    }

    public function test_the_answer_to_a_ceiling_change_gives_it_to_the_last_digit(): void
    {
        $reponse = $this->patchJson('/api/admin/ai/usages/'.UsageDEssai::KEY, ['daily_budget_usd' => self::INFIME])->assertOk();

        $usage = collect($reponse->json('data'))->firstWhere('key', UsageDEssai::KEY);
        $this->assertSame(self::INFIME, $usage['daily_budget_usd']);
    }

    public function test_the_dashboard_gives_every_amount_to_the_last_digit(): void
    {
        config(['ai.budgets.daily_global_usd' => self::PLAFOND_DECLARE]);
        AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success', 'cost_estimate_usd' => self::INFIME]);
        $url = '/api/admin/ai/dashboard?'.http_build_query(['from' => now()->toDateString(), 'to' => now()->toDateString()]);

        $data = $this->getJson($url)->assertOk()->json('data');

        $this->assertSame(self::INFIME, $data['days'][0]['cost_usd']);
        $this->assertSame(self::INFIME, $data['today']['spent_usd']);
        $this->assertSame(self::PLAFOND_DECLARE, $data['today']['daily_budget_usd']);
    }

    public function test_the_radar_dashboard_gives_every_amount_to_the_last_digit(): void
    {
        config(['ai.budgets.daily_global_usd' => self::PLAFOND_DECLARE]);
        $this->app->forgetInstance(AiUsageRegistry::class);
        AiUsageSetting::query()->create(['usage_key' => 'radar.extraction', 'daily_budget_usd' => self::INFIME]);
        AiCall::query()->create(['usage_key' => 'radar.extraction', 'outcome' => 'success', 'cost_estimate_usd' => self::INFIME]);

        $ai = $this->getJson('/api/admin/radar/dashboard')->assertOk()->json('data.ai');

        $this->assertSame(self::INFIME, $ai['spent_today_usd']);
        $this->assertSame(self::INFIME, $ai['daily_budget_usd']);
        $this->assertSame(self::INFIME, $ai['global_spent_today_usd']);
        $this->assertSame(self::PLAFOND_DECLARE, $ai['global_daily_budget_usd']);
    }

    public function test_the_catalogue_gives_the_four_prices_to_the_last_digit(): void
    {
        AiModel::factory()->create(['model' => 'modele-infime', 'input' => '0.00000000001', 'output' => '0.00000000002', 'cache_read' => '0.00000000003', 'cache_write' => self::INFIME]);

        $ligne = collect($this->getJson('/api/admin/ai/models')->assertOk()->json('data'))->firstWhere('model', 'modele-infime');

        $this->assertSame(
            ['0.00000000001', '0.00000000002', '0.00000000003', self::INFIME],
            [$ligne['input'], $ligne['output'], $ligne['cache_read'], $ligne['cache_write']],
        );
    }

    public function test_the_journal_keeps_a_tiny_ceiling_to_the_last_digit(): void
    {
        $this->patchJson('/api/admin/ai/usages/'.UsageDEssai::KEY, ['daily_budget_usd' => self::INFIME])->assertOk();
        $this->patchJson('/api/admin/ai/usages/'.UsageDEssai::KEY, ['daily_budget_usd' => '1'])->assertOk();

        $journal = Activity::query()->where('event', 'super_admin_ai_usage_updated')->orderBy('id')->get();

        $this->assertSame(self::INFIME, $journal[0]->properties['after']['daily_budget_usd']);
        $this->assertSame(self::INFIME, $journal[1]->properties['before']['daily_budget_usd']);
    }
}
