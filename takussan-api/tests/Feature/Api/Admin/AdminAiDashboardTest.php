<?php

namespace Tests\Feature\Api\Admin;

use App\Models\AiCall;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/** TCK-2385 (AC5) — pour des journées semées, le coût et le nombre d'appels par usage sont exacts. */
class AdminAiDashboardTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private function ligne(string $outcome, ?float $cout, array $extra = []): AiCall
    {
        return AiCall::query()->create($extra + ['usage_key' => UsageDEssai::KEY, 'outcome' => $outcome, 'cost_estimate' => $cout, 'duration_ms' => 100]);
    }

    public function test_cost_and_calls_per_usage_and_day_are_exact(): void
    {
        $this->installerSocleDEssai();
        $this->actingAsRole('super_admin');
        $this->ligne('success', 10.5);
        $this->ligne('success', 4.5);
        $this->ligne('cache_hit', 0);
        $this->ligne('refused', null);
        $this->ligne('failed_over', null);
        $this->ligne('success', 100, ['is_evaluation' => true]);
        $this->ligne('success', 7)->forceFill(['created_at' => now()->subDay()])->save();

        $jours = collect($this->getJson('/api/admin/ai/dashboard?'.http_build_query([
            'from' => now()->subDay()->toDateString(), 'to' => now()->toDateString(),
        ]))->assertOk()->json('data.days'))->keyBy('date');

        $aujourdhui = $jours[now()->toDateString()];
        $this->assertEquals([3, 15.0, 1, 1, 1], [$aujourdhui['calls'], $aujourdhui['cost_xof'], $aujourdhui['refusals'], $aujourdhui['failovers'], $aujourdhui['cache_hits']]);
        $this->assertEquals([1, 7.0], [$jours[now()->subDay()->toDateString()]['calls'], $jours[now()->subDay()->toDateString()]['cost_xof']]);
    }

    public function test_the_period_is_validated(): void
    {
        $this->installerSocleDEssai();
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/ai/dashboard?from=2026-10-27&to=2026-10-01')->assertStatus(422)->assertJsonValidationErrors('to');
    }
}
