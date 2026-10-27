<?php

namespace Tests\Feature\Ai;

use App\Services\Ai\AiGateway;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\Evaluation\FieldScorer;
use App\Services\Ai\ModelResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Tests\Support\Ai\AgentDEssai;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/**
 * TCK-2384 (AC3, AC4) — `ai:eval` sur faux modèle : score par champ, échec sous la référence,
 * et `--update-baseline` seul chemin qui réécrit la référence.
 */
class AiEvalCommandTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private string $racine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        $this->racine = storage_path('framework/testing/ai-evals-'.Str::random(8));
        $cas = $this->racine.'/'.UsageDEssai::KEY.'/cases';
        File::ensureDirectoryExists($cas);
        File::put($cas.'/01.json', json_encode(['input' => 'Villa à Ngor, 100 francs', 'expected' => ['titre' => 'Villa', 'prix' => 100]]));
        File::put($cas.'/02.json', json_encode(['input' => 'Villa aux Almadies, 100 francs', 'expected' => ['titre' => 'Villa', 'prix' => 100]]));
        File::put($this->racine.'/'.UsageDEssai::KEY.'/baseline.json', json_encode(['global' => 0.9, 'fields' => ['prix' => 1.0, 'titre' => 1.0]]));

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

    public function test_a_wrong_field_shows_in_its_score_and_fails_under_the_baseline(): void
    {
        $avant = File::get($this->racine.'/'.UsageDEssai::KEY.'/baseline.json');

        $this->artisan('ai:eval', ['usage' => UsageDEssai::KEY])
            ->expectsOutputToContain('0.5000')
            ->expectsOutputToContain('prix')
            ->assertFailed();

        $this->assertSame($avant, File::get($this->racine.'/'.UsageDEssai::KEY.'/baseline.json'));
        $this->assertCount(1, File::files($this->racine.'/rapports/'.UsageDEssai::KEY));
    }

    public function test_update_baseline_is_the_only_way_to_rewrite_the_baseline(): void
    {
        $this->artisan('ai:eval', ['usage' => UsageDEssai::KEY, '--update-baseline' => true])->assertSuccessful();

        $baseline = json_decode(File::get($this->racine.'/'.UsageDEssai::KEY.'/baseline.json'), true);
        $this->assertSame(0.5, $baseline['global']);
        $this->assertSame(['prix' => 0.0, 'titre' => 1.0], $baseline['fields']);
    }

    public function test_a_candidate_model_is_evaluated_instead_of_the_role_chain(): void
    {
        $modeles = [];
        AgentDEssai::fake(function (string $p, $a, $provider, string $model) use (&$modeles) {
            $modeles[] = $model;

            return ['titre' => 'Villa', 'prix' => 100];
        });

        $this->artisan('ai:eval', ['usage' => UsageDEssai::KEY, '--model' => 'anthropic/modele-b'])->assertSuccessful();

        $this->assertSame(['modele-b', 'modele-b'], $modeles);
    }

    public function test_without_any_provider_key_it_does_nothing(): void
    {
        config(['ai.providers.anthropic.key' => null]);

        $this->artisan('ai:eval', ['--all' => true])->assertSuccessful();

        AgentDEssai::assertNeverPrompted();
    }
}
