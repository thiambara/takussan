<?php

namespace Tests\Feature\Api\Admin;

use App\Services\Ai\AiGateway;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\Evaluation\FieldScorer;
use App\Services\Ai\ModelResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Laravel\Ai\Exceptions\ProviderOverloadedException;
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

    public function test_an_unknown_evaluation_is_a_404(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/ai/evaluations/999999')->assertNotFound();
        $this->getJson('/api/admin/ai/evaluations/abc')->assertNotFound();
    }
}
