<?php

namespace Tests\Feature\Ai;

use App\Models\Agency;
use App\Models\AiCall;
use App\Models\AiUsageSetting;
use App\Services\Ai\AiBudget;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/** TCK-2383 — trois plafonds journaliers en XOF : global, par usage, par agence. */
class AiBudgetTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
    }

    private function depense(float $cout, array $colonnes = []): void
    {
        AiCall::query()->create($colonnes + ['usage_key' => UsageDEssai::KEY, 'outcome' => 'success', 'cost_estimate' => $cout]);
    }

    public function test_the_global_ceiling_counts_today_only_and_ignores_evaluations(): void
    {
        config(['ai.budgets.daily_global_xof' => 100]);
        $this->depense(60);
        $this->depense(500, ['is_evaluation' => true]);
        $hier = AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success', 'cost_estimate' => 500]);
        $hier->forceFill(['created_at' => now()->subDay()])->save();

        $this->assertFalse(app(AiBudget::class)->exhausted(new UsageDEssai, null, null));

        $this->depense(40);
        $this->assertTrue(app(AiBudget::class)->exhausted(new UsageDEssai, null, null));
    }

    public function test_the_usage_ceiling_of_the_console_replaces_the_declared_one(): void
    {
        $this->depense(30);
        $setting = AiUsageSetting::query()->create(['usage_key' => UsageDEssai::KEY, 'enabled' => true, 'daily_budget_xof' => 30]);

        $this->assertTrue(app(AiBudget::class)->exhausted(new UsageDEssai, $setting, null));
    }

    public function test_the_agency_ceiling_only_counts_that_agency(): void
    {
        config(['ai.budgets.daily_per_agency_xof' => 50]);
        [$a, $b] = Agency::factory()->count(2)->create();
        $this->depense(50, ['agency_id' => $a->id]);

        $this->assertTrue(app(AiBudget::class)->exhausted(new UsageDEssai, null, $a->id));
        $this->assertFalse(app(AiBudget::class)->exhausted(new UsageDEssai, null, $b->id));
        $this->assertSame(50.0, app(AiBudget::class)->spentToday(UsageDEssai::KEY));
    }
}
