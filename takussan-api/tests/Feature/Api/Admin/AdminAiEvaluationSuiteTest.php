<?php

namespace Tests\Feature\Api\Admin;

use App\Jobs\Ai\RunAiEvaluation;
use App\Models\AiEvaluationRun;
use App\Models\Enums\AiEvaluationStatus;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\Evaluation\FieldScorer;
use App\Services\Ai\ModelResolver;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Tests\Support\Ai\AgentDEssai;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/** TCK-2459 — l'évaluation complète ne tourne plus la nuit par défaut, et se lance à la main. */
class AdminAiEvaluationSuiteTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private string $racine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        $this->racine = storage_path('framework/testing/ai-evals-'.Str::random(8));
        File::ensureDirectoryExists($this->racine.'/'.UsageDEssai::KEY.'/cases');
        File::put($this->racine.'/'.UsageDEssai::KEY.'/cases/01.json', json_encode(['input' => 'Villa, 100 francs', 'expected' => ['titre' => 'Villa', 'prix' => 100]]));
        File::put($this->racine.'/'.UsageDEssai::KEY.'/baseline.json', json_encode(['global' => 0.9, 'fields' => ['prix' => 1.0, 'titre' => 1.0], 'model' => 'anthropic/modele-a']));
        $this->app->instance(EvaluationRunner::class, new EvaluationRunner(
            app(AiGateway::class), app(AiUsageRegistry::class), app(ModelResolver::class), new FieldScorer,
            $this->racine, $this->racine.'/rapports',
        ));
        AgentDEssai::fake(fn () => ['titre' => 'Villa', 'prix' => 100]);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->racine);
        parent::tearDown();
    }

    private function evenementDeNuit(): Event
    {
        return collect(app(Schedule::class)->events())
            ->first(fn (Event $e): bool => str_contains((string) $e->command, 'ai:eval --all'));
    }

    public function test_the_nightly_run_is_off_unless_asked_for(): void
    {
        config(['ai.eval_nightly' => false]);
        $this->assertFalse($this->evenementDeNuit()->filtersPass($this->app));

        config(['ai.eval_nightly' => true]);
        $this->assertTrue($this->evenementDeNuit()->filtersPass($this->app));
    }

    public function test_an_operator_starts_the_suite_and_reads_its_report(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/ai/evaluations/suite')->assertOk()->assertJsonPath('data', null);

        $id = $this->postJson('/api/admin/ai/evaluations/suite')->assertStatus(202)->json('data.id');

        $this->getJson('/api/admin/ai/evaluations/suite')->assertOk()
            ->assertJsonPath('data.id', $id)
            ->assertJsonPath('data.role', null)
            ->assertJsonPath('data.candidate', null)
            ->assertJsonPath('data.status', 'done')
            ->assertJsonPath('data.below_baseline', false);

        // La clé d'un usage porte un point : `assertJsonPath` la lirait comme un chemin.
        $rapport = $this->getJson('/api/admin/ai/evaluations/suite')->json('data.report.usages')[UsageDEssai::KEY];
        $this->assertSame(1, $rapport['cases']);
        $this->assertSame(0.9, $rapport['baseline']['global']);
        $this->assertNotNull($this->getJson('/api/admin/ai/evaluations/suite')->json('data.total_cost_usd'));
    }

    public function test_the_suite_reports_a_score_under_the_baseline(): void
    {
        AgentDEssai::fake(fn () => ['titre' => 'Autre', 'prix' => 1]);
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/ai/evaluations/suite')->assertStatus(202);

        $this->getJson('/api/admin/ai/evaluations/suite')->assertJsonPath('data.below_baseline', true);
    }

    public function test_two_suites_do_not_run_together(): void
    {
        Bus::fake([RunAiEvaluation::class]);
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/ai/evaluations/suite')->assertStatus(202);
        $this->postJson('/api/admin/ai/evaluations/suite')->assertStatus(409)->assertJsonPath('code', 'ai.eval.suite_already_running');

        Bus::assertDispatchedTimes(RunAiEvaluation::class, 1);
    }

    public function test_a_candidate_evaluation_neither_blocks_the_suite_nor_counts_as_one(): void
    {
        Bus::fake([RunAiEvaluation::class]);
        $this->actingAsRole('super_admin');
        AiEvaluationRun::query()->create(['role' => 'extraction', 'candidate' => ['provider' => 'anthropic', 'model' => 'modele-b'], 'status' => AiEvaluationStatus::Queued]);

        $this->getJson('/api/admin/ai/evaluations/suite')->assertJsonPath('data', null);
        $this->postJson('/api/admin/ai/evaluations/suite')->assertStatus(202);
    }

    public function test_an_operator_without_the_manage_ability_cannot_start_the_suite(): void
    {
        $user = $this->actingAsRole('super_admin');
        $user->platformProfile->update(['level' => 'support']);

        $this->postJson('/api/admin/ai/evaluations/suite')->assertForbidden();
    }
}
