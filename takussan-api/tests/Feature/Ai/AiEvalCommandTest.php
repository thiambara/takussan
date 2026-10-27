<?php

namespace Tests\Feature\Ai;

use App\Ai\Usages\ConnectionTestUsage;
use App\Models\AiCall;
use App\Models\Enums\AiModelRole;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\Evaluation\FieldScorer;
use App\Services\Ai\ModelLink;
use App\Services\Ai\ModelResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Files\LocalImage;
use Tests\Support\Ai\AgentDEssai;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\Support\Ai\UsageVisionDEssai;
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

    public function test_an_outage_fails_even_without_a_baseline(): void
    {
        File::delete($this->racine.'/'.UsageDEssai::KEY.'/baseline.json');
        AgentDEssai::fake(fn () => throw RateLimitedException::forProvider('anthropic'));

        $this->artisan('ai:eval', ['usage' => UsageDEssai::KEY])
            ->expectsOutputToContain('ai.eval.failures')
            ->assertFailed();
    }

    public function test_update_baseline_is_refused_when_cases_failed(): void
    {
        $avant = File::get($this->racine.'/'.UsageDEssai::KEY.'/baseline.json');
        AgentDEssai::fake(fn () => throw RateLimitedException::forProvider('anthropic'));

        $this->artisan('ai:eval', ['usage' => UsageDEssai::KEY, '--update-baseline' => true])->assertFailed();

        $this->assertSame($avant, File::get($this->racine.'/'.UsageDEssai::KEY.'/baseline.json'));
    }

    public function test_a_null_expected_field_scores_zero_when_the_call_failed(): void
    {
        File::put($this->racine.'/'.UsageDEssai::KEY.'/cases/03.json', json_encode(['input' => 'Villa', 'expected' => ['titre' => 'Villa', 'note' => null]]));
        AgentDEssai::fake(fn () => throw RateLimitedException::forProvider('anthropic'));

        $this->artisan('ai:eval', ['usage' => UsageDEssai::KEY])->assertFailed();

        $rapport = json_decode(File::get(File::files($this->racine.'/rapports/'.UsageDEssai::KEY)[0]->getPathname()), true);
        $this->assertSame(0.0, $rapport['fields']['note']);
        $this->assertSame(3, $rapport['failures']);
    }

    public function test_a_field_is_averaged_over_the_cases_that_contain_it(): void
    {
        File::put($this->racine.'/'.UsageDEssai::KEY.'/cases/03.json', json_encode(['input' => 'Villa', 'expected' => ['titre' => 'Villa', 'surface' => 80]]));
        AgentDEssai::fake(fn () => ['titre' => 'Villa', 'prix' => 100, 'surface' => 80]);

        $this->artisan('ai:eval', ['usage' => UsageDEssai::KEY, '--update-baseline' => true])->assertSuccessful();

        $baseline = json_decode(File::get($this->racine.'/'.UsageDEssai::KEY.'/baseline.json'), true);
        $this->assertSame(1.0, $baseline['fields']['surface']);
        $this->assertSame(1.0, $baseline['fields']['prix']);
    }

    public function test_a_baseline_on_other_fields_is_stale(): void
    {
        File::put($this->racine.'/'.UsageDEssai::KEY.'/baseline.json', json_encode(['global' => 0.5, 'fields' => ['prix' => 1.0, 'titre' => 1.0, 'surface' => 1.0]]));
        AgentDEssai::fake(fn () => ['titre' => 'Villa', 'prix' => 100]);

        $this->artisan('ai:eval', ['usage' => UsageDEssai::KEY])
            ->expectsOutputToContain('ai.eval.baseline_stale')
            ->assertFailed();
    }

    public function test_a_broken_usage_does_not_stop_the_others(): void
    {
        AgentDEssai::fake(fn () => throw new \LogicException('x'));

        $this->artisan('ai:eval', ['usage' => UsageDEssai::KEY])
            ->expectsOutputToContain('LogicException')
            ->assertFailed();
    }

    public function test_without_any_provider_key_it_does_nothing(): void
    {
        config(['ai.providers.anthropic.key' => null]);

        $this->artisan('ai:eval', ['--all' => true])->assertSuccessful();

        AgentDEssai::assertNeverPrompted();
    }

    public function test_all_with_no_evaluation_set_succeeds_and_says_so(): void
    {
        File::deleteDirectory($this->racine.'/'.UsageDEssai::KEY);

        $this->artisan('ai:eval', ['--all' => true])
            ->expectsOutputToContain('jeu d\'évaluation : rien')
            ->assertSuccessful();

        AgentDEssai::assertNeverPrompted();
    }

    public function test_a_named_usage_without_cases_stays_an_error(): void
    {
        File::deleteDirectory($this->racine.'/'.UsageDEssai::KEY);

        $this->artisan('ai:eval', ['usage' => UsageDEssai::KEY])->assertFailed();
    }

    /** TCK-2386 — un jeu de cas à captures : le catalogue d'essai porte l'usage vision et son rôle. */
    private function jeuAvecCaptures(array $piecesDuPremierCas): EvaluationRunner
    {
        config([
            'ai.roles.vision' => [['provider' => 'anthropic', 'model' => 'modele-v', 'max_tokens' => 2000]],
            'ai.pricing.anthropic.modele-v' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75],
        ]);
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry([UsageDEssai::class, UsageVisionDEssai::class, ConnectionTestUsage::class]));
        $dossier = $this->racine.'/'.UsageVisionDEssai::KEY;
        File::ensureDirectoryExists($dossier.'/cases');
        File::ensureDirectoryExists($dossier.'/captures');
        File::put($dossier.'/captures/annonce.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='));
        File::put($dossier.'/cases/01.json', json_encode(['input' => 'Capture d\'une annonce', 'attachments' => $piecesDuPremierCas, 'expected' => ['titre' => 'Villa', 'prix' => 100]]));
        File::put($dossier.'/cases/02.json', json_encode(['input' => 'Villa à Ngor, 100 francs', 'expected' => ['titre' => 'Villa', 'prix' => 100]]));

        return new EvaluationRunner(app(AiGateway::class), app(AiUsageRegistry::class), app(ModelResolver::class), new FieldScorer, $this->racine, $this->racine.'/rapports');
    }

    public function test_a_case_with_attachments_sends_them_as_images_on_the_vision_chain(): void
    {
        $runner = $this->jeuAvecCaptures(['captures/annonce.png']);
        $appels = [];
        AgentDEssai::fake(function (string $p, Collection $pieces, $provider, string $model) use (&$appels) {
            $appels[] = [$model, $pieces->map(fn ($piece) => $piece instanceof LocalImage ? $piece->path : get_debug_type($piece))->all()];

            return ['titre' => 'Villa', 'prix' => 100];
        });

        $rapport = $runner->run(UsageVisionDEssai::KEY);

        $this->assertSame([
            ['modele-v', [$this->racine.'/'.UsageVisionDEssai::KEY.'/captures/annonce.png']],
            ['modele-a', []],
        ], $appels);
        $this->assertSame(0, $rapport['failures']);
        $this->assertSame('anthropic/modele-v, anthropic/modele-a', $rapport['model']);
        $this->assertSame(
            [[AiModelRole::Vision, true], [AiModelRole::Extraction, true]],
            AiCall::query()->orderBy('id')->get()->map(fn (AiCall $c) => [$c->role, $c->is_evaluation])->all(),
        );
    }

    public function test_a_candidate_model_also_serves_the_cases_with_attachments(): void
    {
        $runner = $this->jeuAvecCaptures(['captures/annonce.png']);
        $modeles = [];
        AgentDEssai::fake(function (string $p, Collection $pieces, $provider, string $model) use (&$modeles) {
            $modeles[] = $model;

            return ['titre' => 'Villa', 'prix' => 100];
        });

        $rapport = $runner->run(UsageVisionDEssai::KEY, ModelLink::parse('anthropic/modele-b'));

        $this->assertSame(['modele-b', 'modele-b'], $modeles);
        $this->assertSame('anthropic/modele-b', $rapport['model']);
    }

    public function test_an_attachment_outside_the_usage_folder_or_missing_is_refused(): void
    {
        AgentDEssai::fake(fn () => ['titre' => 'Villa', 'prix' => 100]);

        foreach (['../essai.extraction/baseline.json' => 'ai.eval.attachment_invalid', '/etc/hosts' => 'ai.eval.attachment_invalid', 'captures/absente.png' => 'ai.eval.attachment_missing'] as $chemin => $code) {
            try {
                $this->jeuAvecCaptures([$chemin])->run(UsageVisionDEssai::KEY);
                $this->fail("{$chemin} devait être refusé");
            } catch (InvalidArgumentException $e) {
                $this->assertSame($code, $e->getMessage(), $chemin);
            }
        }
        AgentDEssai::assertNeverPrompted();
    }
}
