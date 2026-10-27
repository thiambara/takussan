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
use ErrorException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Laravel\Ai\Exceptions\ProviderOverloadedException;
use RuntimeException;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\Ai\AgentDEssai;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/** TCK-2385 (AC4) — évaluer un candidat depuis la console ; une affectation sous le cliquet est refusée, sauf dérogation motivée. */
class AdminAiEvaluationsTest extends TestCase
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
        AgentDEssai::fake(fn () => ['titre' => 'Villa', 'prix' => 90]);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->racine);
        parent::tearDown();
    }

    private function evaluer(): int
    {
        return $this->postJson('/api/admin/ai/evaluations', ['role' => 'extraction', 'provider' => 'anthropic', 'model' => 'modele-b'])
            ->assertStatus(202)->json('data.id');
    }

    public function test_an_evaluation_runs_and_reports_each_field_against_the_baseline(): void
    {
        $this->actingAsRole('super_admin');

        $id = $this->evaluer();

        $reponse = $this->getJson('/api/admin/ai/evaluations/'.$id)->assertOk()
            ->assertJsonPath('data.status', 'done')
            ->assertJsonPath('data.below_baseline', true);
        // La clé d'usage porte un point : `assertJsonPath` ne sait pas l'échapper, on indexe à la main.
        $usage = $reponse->json('data.report.usages')[UsageDEssai::KEY];
        $this->assertEquals(0, $usage['fields']['prix']);
        $this->assertEquals(0.9, $usage['baseline']['global']);
        $this->assertSame('ai.eval.below_baseline', $usage['verdict']);
    }

    public function test_assigning_a_model_under_the_ratchet_needs_a_reason_which_is_journaled(): void
    {
        $this->actingAsRole('super_admin');
        $this->evaluer();
        $chaine = ['chain' => [['provider' => 'anthropic', 'model' => 'modele-b']]];

        $this->putJson('/api/admin/ai/roles/extraction', $chaine)->assertStatus(422)->assertJsonPath('code', 'ai.evaluation_below_baseline');

        $this->putJson('/api/admin/ai/roles/extraction', $chaine + ['override_reason' => 'Fournisseur principal en panne prolongée'])->assertOk();
        $this->assertSame('Fournisseur principal en panne prolongée', Activity::query()->where('event', 'super_admin_ai_role_updated')->sole()->properties['override_reason']);
    }

    public function test_an_unevaluated_model_can_be_assigned(): void
    {
        $this->actingAsRole('super_admin');

        $this->putJson('/api/admin/ai/roles/extraction', ['chain' => [['provider' => 'anthropic', 'model' => 'modele-b']]])->assertOk();
    }

    public function test_a_role_without_any_case_cannot_be_evaluated(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/ai/evaluations', ['role' => 'vision', 'provider' => 'anthropic', 'model' => 'modele-b'])->assertStatus(422)->assertJsonPath('code', 'ai.eval.no_cases');
    }

    public function test_a_candidate_whose_calls_all_fail_never_passes_the_ratchet(): void
    {
        $this->actingAsRole('super_admin');
        // Une surcharge du fournisseur : le maillon bascule, la chaîne s'épuise, chaque cas échoue.
        AgentDEssai::fake(fn () => throw ProviderOverloadedException::forProvider('anthropic'));
        $chaine = ['chain' => [['provider' => 'anthropic', 'model' => 'modele-b']]];

        $id = $this->evaluer();

        $reponse = $this->getJson('/api/admin/ai/evaluations/'.$id)->assertOk()
            ->assertJsonPath('data.status', 'done')
            ->assertJsonPath('data.below_baseline', true);
        $this->assertSame('ai.eval.failures', $reponse->json('data.report.usages')[UsageDEssai::KEY]['verdict']);
        $this->putJson('/api/admin/ai/roles/extraction', $chaine)->assertStatus(422)->assertJsonPath('code', 'ai.evaluation_below_baseline');
    }

    private function course(AiEvaluationStatus $statut, string $modele = 'modele-b'): AiEvaluationRun
    {
        return AiEvaluationRun::query()->create([
            'role' => 'extraction', 'candidate' => ['provider' => 'anthropic', 'model' => $modele, 'max_tokens' => null],
            'status' => $statut,
        ]);
    }

    public function test_a_job_killed_before_its_catch_moves_a_running_evaluation_to_failed(): void
    {
        $run = $this->course(AiEvaluationStatus::Running);

        (new RunAiEvaluation($run->id))->failed(new RuntimeException('x'));

        $run->refresh();
        $this->assertSame(AiEvaluationStatus::Failed, $run->status);
        $this->assertSame('ai.unexpected', $run->error_code);
        $this->assertNotNull($run->finished_at);
    }

    public function test_a_job_failed_without_exception_gets_a_generic_error_code(): void
    {
        $run = $this->course(AiEvaluationStatus::Queued);

        (new RunAiEvaluation($run->id))->failed(null);

        $this->assertSame('ai.eval.job_failed', $run->fresh()->error_code);
        $this->assertSame(AiEvaluationStatus::Failed, $run->fresh()->status);
    }

    public function test_failed_never_overwrites_a_terminal_state(): void
    {
        $fait = $this->course(AiEvaluationStatus::Done);
        $echoue = $this->course(AiEvaluationStatus::Failed);
        $echoue->forceFill(['error_code' => 'Premiere'])->save();

        (new RunAiEvaluation($fait->id))->failed(new RuntimeException('x'));
        (new RunAiEvaluation($echoue->id))->failed(new RuntimeException('x'));

        $this->assertSame(AiEvaluationStatus::Done, $fait->fresh()->status);
        $this->assertNull($fait->fresh()->error_code);
        $this->assertSame('Premiere', $echoue->fresh()->error_code);
    }

    public function test_an_exception_in_the_run_is_reported_and_the_run_fails(): void
    {
        Exceptions::fake();
        // Un candidat sans modèle : `ModelLink::fromArray()` lève dans le `try` du job.
        $run = $this->course(AiEvaluationStatus::Queued);
        $run->forceFill(['candidate' => ['provider' => 'anthropic']])->save();

        (new RunAiEvaluation($run->id))->handle(app(EvaluationRunner::class), app(AiUsageRegistry::class));

        Exceptions::assertReported(ErrorException::class);
        $this->assertSame(AiEvaluationStatus::Failed, $run->fresh()->status);
        $this->assertSame('ai.unexpected', $run->fresh()->error_code);
    }

    public function test_a_run_already_failed_by_the_queue_is_not_turned_back_by_the_late_outcome(): void
    {
        $run = $this->course(AiEvaluationStatus::Queued);
        // Le worker d'origine tourne encore quand la file déclare l'évaluation échouée (reprise après
        // `retry_after`) : son verdict, arrivé plus tard, ne doit pas la faire repasser en `done`.
        AgentDEssai::fake(function () use ($run) {
            (new RunAiEvaluation($run->id))->failed(new RuntimeException('file'));

            return ['titre' => 'Villa', 'prix' => 90];
        });

        (new RunAiEvaluation($run->id))->handle(app(EvaluationRunner::class), app(AiUsageRegistry::class));

        $this->assertSame(AiEvaluationStatus::Failed, $run->fresh()->status);
        $this->assertSame('ai.unexpected', $run->fresh()->error_code);
        $this->assertNull($run->fresh()->report);
    }

    public function test_the_job_fails_on_timeout(): void
    {
        $this->assertTrue((new RunAiEvaluation(1))->failOnTimeout);
    }

    public function test_the_same_candidate_cannot_be_evaluated_twice_at_once(): void
    {
        $this->actingAsRole('super_admin');
        $this->course(AiEvaluationStatus::Running);
        $corps = ['role' => 'extraction', 'provider' => 'anthropic', 'model' => 'modele-b'];

        $this->postJson('/api/admin/ai/evaluations', $corps)->assertStatus(409)->assertJsonPath('code', 'ai.eval.already_running');
        $this->assertSame(1, AiEvaluationRun::query()->count());
    }

    public function test_a_queued_evaluation_also_blocks_a_duplicate(): void
    {
        $this->actingAsRole('super_admin');
        $this->course(AiEvaluationStatus::Queued);

        $this->postJson('/api/admin/ai/evaluations', ['role' => 'extraction', 'provider' => 'anthropic', 'model' => 'modele-b'])
            ->assertStatus(409)->assertJsonPath('code', 'ai.eval.already_running');
    }

    public function test_a_finished_or_different_candidate_does_not_block_a_new_evaluation(): void
    {
        $this->actingAsRole('super_admin');
        $this->course(AiEvaluationStatus::Done);
        $this->course(AiEvaluationStatus::Failed);
        $this->course(AiEvaluationStatus::Running, 'modele-a');

        $this->evaluer();
    }

    public function test_a_job_run_on_a_non_queued_evaluation_does_not_call_the_model(): void
    {
        $this->actingAsRole('super_admin');
        // Un seul consommateur de `default` : un job tué (SIGKILL) est relivré après `retry_after` et doit échouer
        // aussitôt via `failed()` ; avec `$tries` > 1 il resterait `running` jusqu'à 2100 s sans filet.
        $this->assertSame(1, (new RunAiEvaluation(1))->tries);
        $run = $this->course(AiEvaluationStatus::Running);
        $run->forceFill(['started_at' => now()->subMinutes(2)])->save();
        $appels = 0;
        AgentDEssai::fake(function () use (&$appels) {
            $appels++;

            return ['titre' => 'Villa', 'prix' => 90];
        });

        (new RunAiEvaluation($run->id))->handle(app(EvaluationRunner::class), app(AiUsageRegistry::class));

        $this->assertSame(0, $appels);
        $this->assertSame(AiEvaluationStatus::Running, $run->fresh()->status);
        $this->assertNull($run->fresh()->error_code);
    }

    public function test_the_start_is_atomic_so_two_handles_on_one_queued_run_call_the_model_for_one(): void
    {
        $run = $this->course(AiEvaluationStatus::Queued);
        $appels = 0;
        AgentDEssai::fake(function () use (&$appels) {
            $appels++;

            return ['titre' => 'Villa', 'prix' => 100];
        });

        (new RunAiEvaluation($run->id))->handle(app(EvaluationRunner::class), app(AiUsageRegistry::class));
        $apresLePremier = $appels;
        (new RunAiEvaluation($run->id))->handle(app(EvaluationRunner::class), app(AiUsageRegistry::class));

        $this->assertGreaterThan(0, $apresLePremier);
        $this->assertSame($apresLePremier, $appels);
        $this->assertSame(AiEvaluationStatus::Done, $run->fresh()->status);
        $this->assertNotNull($run->fresh()->started_at);
    }

    public function test_a_worker_that_lost_the_race_between_read_and_start_does_not_call_the_model(): void
    {
        $run = $this->course(AiEvaluationStatus::Queued);
        $appels = 0;
        AgentDEssai::fake(function () use (&$appels) {
            $appels++;

            return ['titre' => 'Villa', 'prix' => 100];
        });
        // Un autre worker démarre l'évaluation entre la lecture de celui-ci et sa mise à jour : la lecture
        // de ce worker dit encore `queued`, la base dit déjà `running`.
        AiEvaluationRun::retrieved(function (AiEvaluationRun $lu): void {
            AiEvaluationRun::query()->whereKey($lu->id)->update(['status' => AiEvaluationStatus::Running->value]);
        });

        (new RunAiEvaluation($run->id))->handle(app(EvaluationRunner::class), app(AiUsageRegistry::class));

        $this->assertSame(0, $appels);
        $this->assertSame(AiEvaluationStatus::Running, $run->fresh()->status);
    }

    public function test_a_held_creation_lock_answers_already_running_without_creating_a_run(): void
    {
        $this->actingAsRole('super_admin');
        $verrou = Cache::lock('ai-eval:extraction:anthropic:modele-b', 10);
        $this->assertTrue($verrou->get());

        $this->postJson('/api/admin/ai/evaluations', ['role' => 'extraction', 'provider' => 'anthropic', 'model' => 'modele-b'])
            ->assertStatus(409)->assertJsonPath('code', 'ai.eval.already_running');
        $this->assertSame(0, AiEvaluationRun::query()->count());

        $verrou->release();
        $this->evaluer();
    }

    public function test_the_creation_lock_is_released_after_a_request(): void
    {
        $this->actingAsRole('super_admin');
        $this->evaluer();

        $verrou = Cache::lock('ai-eval:extraction:anthropic:modele-b', 10);
        $this->assertTrue($verrou->get());
        $verrou->release();
    }

    public function test_a_running_evaluation_whose_worker_died_reads_as_lost(): void
    {
        $this->actingAsRole('super_admin');
        $run = $this->course(AiEvaluationStatus::Running);
        $run->forceFill(['started_at' => now()->subSeconds(AiEvaluationRun::STALE_AFTER_SECONDS + 1)])->save();

        $this->getJson('/api/admin/ai/evaluations/'.$run->id)->assertOk()
            ->assertJsonPath('data.status', 'failed')
            ->assertJsonPath('data.error_code', 'ai.eval.job_lost');
        $this->assertNotNull($run->fresh()->finished_at);
    }

    public function test_a_fresh_running_evaluation_is_not_read_as_lost(): void
    {
        $this->actingAsRole('super_admin');
        $run = $this->course(AiEvaluationStatus::Running);
        $run->forceFill(['started_at' => now()->subSeconds(AiEvaluationRun::STALE_AFTER_SECONDS - 60)])->save();

        $this->getJson('/api/admin/ai/evaluations/'.$run->id)->assertOk()->assertJsonPath('data.status', 'running');
    }

    public function test_a_queued_evaluation_never_picked_up_for_a_day_reads_as_lost(): void
    {
        $this->actingAsRole('super_admin');
        $run = $this->course(AiEvaluationStatus::Queued);
        $run->forceFill(['created_at' => now()->subDays(2)])->save();

        $this->getJson('/api/admin/ai/evaluations/'.$run->id)->assertOk()
            ->assertJsonPath('data.status', 'failed')
            ->assertJsonPath('data.error_code', 'ai.eval.job_lost');
    }

    public function test_a_lost_evaluation_does_not_block_a_new_one_but_a_fresh_one_does(): void
    {
        $this->actingAsRole('super_admin');
        $corps = ['role' => 'extraction', 'provider' => 'anthropic', 'model' => 'modele-b'];
        $perdue = $this->course(AiEvaluationStatus::Running);
        $perdue->forceFill(['started_at' => now()->subSeconds(AiEvaluationRun::STALE_AFTER_SECONDS + 1)])->save();

        $this->postJson('/api/admin/ai/evaluations', $corps)->assertStatus(202);

        $this->assertSame(AiEvaluationStatus::Failed, $perdue->fresh()->status);
        $this->assertSame('ai.eval.job_lost', $perdue->fresh()->error_code);
        // La nouvelle évaluation a tourné (file synchrone en test) : on en recrée une en cours, récente.
        $this->course(AiEvaluationStatus::Running)->forceFill(['started_at' => now()->subMinutes(2)])->save();
        $this->postJson('/api/admin/ai/evaluations', $corps)->assertStatus(409)->assertJsonPath('code', 'ai.eval.already_running');
    }

    public function test_marking_lost_never_overwrites_a_run_that_finished_meanwhile(): void
    {
        $run = $this->course(AiEvaluationStatus::Running);
        $run->forceFill(['started_at' => now()->subSeconds(AiEvaluationRun::STALE_AFTER_SECONDS + 1)])->save();
        $perime = AiEvaluationRun::query()->findOrFail($run->id);
        // Le worker d'origine écrit son verdict entre la lecture et la mise à jour.
        AiEvaluationRun::query()->whereKey($run->id)->update(['status' => AiEvaluationStatus::Done->value]);

        $perime->markLostIfStale();

        $this->assertSame(AiEvaluationStatus::Done, $run->fresh()->status);
        $this->assertNull($run->fresh()->error_code);
    }

    public function test_an_unknown_evaluation_is_a_404(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/ai/evaluations/999999')->assertNotFound();
        $this->getJson('/api/admin/ai/evaluations/abc')->assertNotFound();
    }
}
