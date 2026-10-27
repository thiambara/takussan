<?php

namespace Tests\Feature\Api\Admin;

use App\Models\AiCall;
use App\Models\AiSuggestion;
use App\Models\User;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiResult;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\Evaluation\FieldScorer;
use App\Services\Ai\ModelResolver;
use App\Services\Ai\SuggestionRecorder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
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

    public function test_acceptance_follows_the_selected_period_on_both_ends(): void
    {
        $this->installerSocleDEssai();
        $this->actingAsRole('super_admin');
        $recorder = app(SuggestionRecorder::class);
        $decideur = User::factory()->create();
        $decider = function (string $decision, $quand) use ($recorder, $decideur): void {
            $call = AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success']);
            $suggestion = $recorder->record(new AiResult('{}', ['titre' => 'Villa'], $call, false), inputSnapshot: 'x');
            $recorder->{$decision}($suggestion, $decideur);
            AiSuggestion::query()->whereKey($suggestion->id)->update(['decided_at' => $quand]);
        };
        $decider('accept', now()->subDays(10));                         // avant la période
        $decider('reject', now()->subDays(3));                          // dans la période
        $decider('reject', now()->subDay()->setTime(23, 30));           // dernier jour, fin de journée : inclus
        $decider('accept', now()->addDay()->startOfDay()->addHour());   // après la période

        $acceptance = $this->getJson('/api/admin/ai/dashboard?'.http_build_query([
            'from' => now()->subDays(5)->toDateString(), 'to' => now()->subDay()->toDateString(),
        ]))->assertOk()->json('data.acceptance');

        $this->assertEquals([UsageDEssai::KEY => ['decided' => 2, 'accepted' => 0, 'edited' => 0, 'rejected' => 2, 'rate' => 0.0]], $acceptance);
    }

    public function test_the_period_is_validated(): void
    {
        $this->installerSocleDEssai();
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/ai/dashboard?from=2026-10-27&to=2026-10-01')->assertStatus(422)->assertJsonValidationErrors('to');
    }

    /** Revue 2 (TCK-2386) — une référence sans global de jeu complet rend le global du rôle de l'usage, jamais rien. */
    public function test_a_baseline_with_only_role_sections_still_shows_a_global(): void
    {
        $this->installerSocleDEssai();
        $racine = storage_path('framework/testing/ai-evals-'.Str::random(8));
        File::ensureDirectoryExists($racine.'/'.UsageDEssai::KEY);
        File::put($racine.'/'.UsageDEssai::KEY.'/baseline.json', json_encode(['roles' => [
            'vision' => ['global' => 0.5, 'fields' => ['prix' => 0.5], 'model' => 'anthropic/modele-v'],
            'extraction' => ['global' => 0.8, 'fields' => ['prix' => 0.8], 'model' => 'anthropic/modele-a'],
        ]]));
        $this->app->instance(EvaluationRunner::class, new EvaluationRunner(app(AiGateway::class), app(AiUsageRegistry::class), app(ModelResolver::class), new FieldScorer, $racine));
        $this->actingAsRole('super_admin');

        try {
            $reference = $this->getJson('/api/admin/ai/dashboard?'.http_build_query(['from' => now()->toDateString(), 'to' => now()->toDateString()]))
                ->assertOk()->json('data.baselines')[UsageDEssai::KEY];
        } finally {
            File::deleteDirectory($racine);
        }

        $this->assertEquals([0.8, 'anthropic/modele-a'], [$reference['global'], $reference['model']]);
    }
}
