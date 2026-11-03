<?php

namespace Tests\Feature\Ai;

use App\Ai\Usages\ConnectionTestUsage;
use App\Models\AiCall;
use App\Models\AiModel;
use App\Models\Enums\AiModelRole;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\Evaluation\FieldScorer;
use App\Services\Ai\ModelLink;
use App\Services\Ai\ModelResolver;
use Illuminate\Console\Command;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Files\LocalImage;
use Laravel\Ai\Responses\Data\Meta;
use Laravel\Ai\Responses\Data\TextUsage;
use Laravel\Ai\Responses\StructuredTextResponse;
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

    /** TCK-2448 — le candidat suit le catalogue : un modèle ajouté en base s'évalue, un modèle retiré non. */
    public function test_a_candidate_follows_the_catalogue_and_its_cost_is_printed_in_dollars(): void
    {
        AgentDEssai::fake(fn (string $p, $a, $provider, string $model) => new StructuredTextResponse(['titre' => 'Villa', 'prix' => 100], '{}', new TextUsage(7, 0), new Meta('anthropic', $model)));
        AiModel::factory()->create(['model' => 'modele-neuf', 'input' => '0.00000000004', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0']);
        AiModel::factory()->create(['model' => 'modele-retire', 'active' => false]);

        $this->artisan('ai:eval', ['usage' => UsageDEssai::KEY, '--model' => 'anthropic/modele-neuf'])
            ->expectsOutputToContain('0.00000000000000056 USD')->assertSuccessful();
        $this->artisan('ai:eval', ['usage' => UsageDEssai::KEY, '--model' => 'anthropic/modele-retire'])->assertExitCode(Command::INVALID);
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
    private function jeuAvecCaptures(array|string $piecesDuPremierCas): EvaluationRunner
    {
        config([
            'ai.roles.vision' => [['provider' => 'anthropic', 'model' => 'modele-v', 'max_tokens' => 2000]],
            'ai.pricing.anthropic.modele-v' => ['input' => '3.0', 'output' => '15.0', 'cache_read' => '0.3', 'cache_write' => '3.75'],
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
        // M1 — `model` reste UN modèle (celui du rôle de l'usage), `models` les nomme tous.
        $this->assertSame('anthropic/modele-a', $rapport['model']);
        $this->assertSame(['anthropic/modele-v', 'anthropic/modele-a'], $rapport['models']);
        $this->assertNull($rapport['role']);
        $this->assertSame(['vision', 'extraction'], array_keys($rapport['roles']));
        $this->assertSame(
            [[AiModelRole::Vision, true], [AiModelRole::Extraction, true]],
            AiCall::query()->orderBy('id')->get()->map(fn (AiCall $c) => [$c->role, $c->is_evaluation])->all(),
        );
    }

    /** Revue I1 — un candidat remplace le premier maillon d'UN rôle : seuls les cas de ce rôle lui sont joués. */
    private function enregistrerAppels(array &$appels, bool $capturesFausses = false): void
    {
        AgentDEssai::fake(function (string $p, Collection $pieces, $provider, string $model) use (&$appels, $capturesFausses) {
            $appels[] = [$model, $pieces->count()];

            return ['titre' => 'Villa', 'prix' => $capturesFausses && $pieces->isNotEmpty() ? 90 : 100];
        });
    }

    public function test_a_candidate_for_the_usage_role_never_sees_the_capture_cases(): void
    {
        $runner = $this->jeuAvecCaptures(['captures/annonce.png']);
        $appels = [];
        $this->enregistrerAppels($appels);

        $explicite = $runner->run(UsageVisionDEssai::KEY, ModelLink::parse('anthropic/modele-b'), AiModelRole::Extraction);
        // Sans rôle nommé, le candidat vaut pour le rôle de l'usage (`ai:eval --model=` sans `--role`).
        $parDefaut = $runner->run(UsageVisionDEssai::KEY, ModelLink::parse('anthropic/modele-b'));

        $this->assertSame([['modele-b', 0], ['modele-b', 0]], $appels);
        foreach ([$explicite, $parDefaut] as $rapport) {
            $this->assertSame(['extraction', 1, 'anthropic/modele-b', ['anthropic/modele-b']], [$rapport['role'], $rapport['cases'], $rapport['model'], $rapport['models']]);
            $this->assertSame(['extraction'], array_keys($rapport['roles']));
        }
    }

    public function test_a_vision_candidate_plays_only_the_capture_cases(): void
    {
        $runner = $this->jeuAvecCaptures(['captures/annonce.png']);
        $appels = [];
        $this->enregistrerAppels($appels);

        $rapport = $runner->run(UsageVisionDEssai::KEY, ModelLink::parse('anthropic/modele-b'), AiModelRole::Vision);

        $this->assertSame([['modele-b', 1]], $appels);
        $this->assertSame(['vision', 1, 'anthropic/modele-b'], [$rapport['role'], $rapport['cases'], $rapport['model']]);
        $this->assertSame([AiModelRole::Vision, 'modele-b'], [AiCall::query()->sole()->role, AiCall::query()->sole()->model]);
    }

    public function test_a_role_without_any_case_of_the_usage_is_refused_before_any_call(): void
    {
        AgentDEssai::fake();
        $runner = $this->jeuAvecCaptures(['captures/annonce.png']);

        try {
            $runner->run(UsageDEssai::KEY, ModelLink::parse('anthropic/modele-b'), AiModelRole::Vision);
            $this->fail('aucun cas vision : refus attendu');
        } catch (InvalidArgumentException $e) {
            $this->assertSame('ai.eval.no_cases', $e->getMessage());
        }
        AgentDEssai::assertNeverPrompted();
    }

    public function test_the_usages_of_a_role_follow_the_effective_role_of_their_cases(): void
    {
        $runner = $this->jeuAvecCaptures(['captures/annonce.png']);

        $this->assertSame([UsageVisionDEssai::KEY], $runner->usagesForRole(AiModelRole::Vision));
        $this->assertSame([UsageDEssai::KEY, UsageVisionDEssai::KEY], $runner->usagesForRole(AiModelRole::Extraction));
        $this->assertSame([], $runner->usagesForRole(AiModelRole::Redaction));

        File::delete($this->racine.'/'.UsageVisionDEssai::KEY.'/cases/01.json');
        $this->assertSame([], $runner->usagesForRole(AiModelRole::Vision));
    }

    public function test_each_role_is_ratcheted_against_its_own_baseline_section(): void
    {
        $runner = $this->jeuAvecCaptures(['captures/annonce.png']);
        File::put($this->racine.'/'.UsageVisionDEssai::KEY.'/baseline.json', json_encode([
            // Un global bas : seule la section du rôle peut retenir la vision (0.5) et le jeu complet (0.75).
            'global' => 0.4, 'fields' => ['prix' => 1.0, 'titre' => 1.0],
            'roles' => [
                'extraction' => ['global' => 1.0, 'fields' => ['prix' => 1.0, 'titre' => 1.0]],
                'vision' => ['global' => 1.0, 'fields' => ['prix' => 1.0, 'titre' => 1.0]],
            ],
        ]));
        $appels = [];
        $this->enregistrerAppels($appels, capturesFausses: true);
        $baseline = $runner->baseline(UsageVisionDEssai::KEY);

        $texte = $runner->run(UsageVisionDEssai::KEY, ModelLink::parse('anthropic/modele-b'), AiModelRole::Extraction);
        $vision = $runner->run(UsageVisionDEssai::KEY, ModelLink::parse('anthropic/modele-b'), AiModelRole::Vision);
        $complet = $runner->run(UsageVisionDEssai::KEY);

        $this->assertNull($runner->verdict($texte, $baseline));
        $this->assertSame('ai.eval.below_baseline', $runner->verdict($vision, $baseline));
        $this->assertSame('ai.eval.below_baseline', $runner->verdict($complet, $baseline));
        $this->assertSame(0.5, $vision['global']);
        $this->assertSame(1.0, $texte['global']);
    }

    public function test_a_role_section_on_other_fields_is_stale(): void
    {
        $runner = $this->jeuAvecCaptures(['captures/annonce.png']);
        File::put($this->racine.'/'.UsageVisionDEssai::KEY.'/baseline.json', json_encode([
            'roles' => ['vision' => ['global' => 0.1, 'fields' => ['prix' => 1.0, 'titre' => 1.0, 'surface' => 1.0]]],
        ]));
        $appels = [];
        $this->enregistrerAppels($appels);

        $vision = $runner->run(UsageVisionDEssai::KEY, ModelLink::parse('anthropic/modele-b'), AiModelRole::Vision);

        $this->assertSame('ai.eval.baseline_stale', $runner->verdict($vision, $runner->baseline(UsageVisionDEssai::KEY)));
    }

    public function test_a_legacy_baseline_without_roles_only_ratchets_the_usage_role(): void
    {
        $runner = $this->jeuAvecCaptures(['captures/annonce.png']);
        File::put($this->racine.'/'.UsageVisionDEssai::KEY.'/baseline.json', json_encode(['global' => 1.0, 'fields' => ['prix' => 1.0, 'titre' => 1.0]]));
        $appels = [];
        AgentDEssai::fake(fn () => ['titre' => 'Villa', 'prix' => 90]);
        $baseline = $runner->baseline(UsageVisionDEssai::KEY);

        $this->assertSame(['extraction'], array_keys($baseline['roles']));
        $this->assertNull($runner->verdict($runner->run(UsageVisionDEssai::KEY, ModelLink::parse('anthropic/modele-b'), AiModelRole::Vision), $baseline));
        $this->assertSame('ai.eval.below_baseline', $runner->verdict($runner->run(UsageVisionDEssai::KEY, ModelLink::parse('anthropic/modele-b'), AiModelRole::Extraction), $baseline));
    }

    public function test_a_role_run_rewrites_only_its_own_baseline_section(): void
    {
        $runner = $this->jeuAvecCaptures(['captures/annonce.png']);
        $appels = [];
        $this->enregistrerAppels($appels, capturesFausses: true);
        $runner->writeBaseline(UsageVisionDEssai::KEY, $runner->run(UsageVisionDEssai::KEY));
        $avant = $runner->baseline(UsageVisionDEssai::KEY);
        $this->assertSame(0.75, $avant['global']);
        $this->assertSame(['vision', 'extraction'], array_keys($avant['roles']));

        $this->enregistrerAppels($appels);
        $runner->writeBaseline(UsageVisionDEssai::KEY, $runner->run(UsageVisionDEssai::KEY, ModelLink::parse('anthropic/modele-b'), AiModelRole::Vision));

        $apres = $runner->baseline(UsageVisionDEssai::KEY);
        $this->assertSame(1.0, $apres['roles']['vision']['global']);
        $this->assertSame('anthropic/modele-b', $apres['roles']['vision']['model']);
        $this->assertSame($avant['roles']['extraction'], $apres['roles']['extraction']);
        $this->assertSame([0.75, $avant['fields']], [$apres['global'], $apres['fields']]);
    }

    public function test_the_command_evaluates_a_candidate_for_the_named_role(): void
    {
        $this->app->instance(EvaluationRunner::class, $this->jeuAvecCaptures(['captures/annonce.png']));
        $appels = [];
        $this->enregistrerAppels($appels);

        $this->artisan('ai:eval', ['usage' => UsageVisionDEssai::KEY, '--model' => 'anthropic/modele-b', '--role' => 'vision'])->assertSuccessful();
        $this->artisan('ai:eval', ['usage' => UsageVisionDEssai::KEY, '--role' => 'inconnu'])->assertExitCode(2);

        $this->assertSame([['modele-b', 1]], $appels);
    }

    public function test_an_attachment_outside_the_usage_folder_or_missing_is_refused(): void
    {
        AgentDEssai::fake(fn () => ['titre' => 'Villa', 'prix' => 100]);

        foreach (['../essai.extraction/baseline.json' => 'ai.eval.attachment_invalid', '/etc/hosts' => 'ai.eval.attachment_invalid', 'captures/absente.png' => 'ai.eval.attachment_missing', 'captures/annonce.png' => 'ai.eval.attachment_invalid'] as $chemin => $code) {
            try {
                // Revue M4 — `"attachments": "captures/annonce.png"`, une chaîne et non une liste : refus codé, jamais un TypeError.
                $this->jeuAvecCaptures($code === 'ai.eval.attachment_invalid' && $chemin === 'captures/annonce.png' ? $chemin : [$chemin])->run(UsageVisionDEssai::KEY);
                $this->fail("{$chemin} devait être refusé");
            } catch (InvalidArgumentException $e) {
                $this->assertSame($code, $e->getMessage(), $chemin);
            }
        }
        AgentDEssai::assertNeverPrompted();
    }

    /** Revue 2 — une première référence vient d'un jeu complet : celle d'un seul rôle, écrite à vide, est refusée. */
    public function test_a_single_role_baseline_cannot_be_the_first_one(): void
    {
        $this->app->instance(EvaluationRunner::class, $runner = $this->jeuAvecCaptures(['captures/annonce.png']));
        $appels = [];
        $this->enregistrerAppels($appels);

        $this->artisan('ai:eval', ['usage' => UsageVisionDEssai::KEY, '--role' => 'vision', '--update-baseline' => true])
            ->expectsOutputToContain('ai.eval.baseline_needs_full_run')
            ->assertFailed();

        $this->assertFalse(File::exists($this->racine.'/'.UsageVisionDEssai::KEY.'/baseline.json'));
        try {
            $runner->writeBaseline(UsageVisionDEssai::KEY, $runner->run(UsageVisionDEssai::KEY, role: AiModelRole::Vision));
            $this->fail('référence d\'un seul rôle sans référence complète : refus attendu');
        } catch (InvalidArgumentException $e) {
            $this->assertSame('ai.eval.baseline_needs_full_run', $e->getMessage());
        }
    }

    public function test_a_baseline_with_only_role_sections_neither_crashes_nor_misprints_the_reference(): void
    {
        $this->app->instance(EvaluationRunner::class, $this->jeuAvecCaptures(['captures/annonce.png']));
        File::put($this->racine.'/'.UsageVisionDEssai::KEY.'/baseline.json', json_encode(['roles' => [
            'extraction' => ['global' => 0.25, 'fields' => ['prix' => 0.25, 'titre' => 0.25]],
            'vision' => ['global' => 0.75, 'fields' => ['prix' => 0.75, 'titre' => 0.75]],
        ]]));
        $appels = [];
        $this->enregistrerAppels($appels);

        $this->artisan('ai:eval', ['usage' => UsageVisionDEssai::KEY])
            ->expectsOutputToContain('(référence aucune)')
            ->expectsOutputToContain('référence 0.2500')
            ->expectsOutputToContain('référence 0.7500')
            ->assertSuccessful();
        // Le rôle évalué se lit contre SA section, jamais contre un global d'un autre jeu.
        $this->artisan('ai:eval', ['usage' => UsageVisionDEssai::KEY, '--role' => 'vision'])
            ->expectsOutputToContain('(référence 0.7500)')
            ->assertSuccessful();
    }

    public function test_a_single_role_rewrite_says_the_full_reference_is_kept(): void
    {
        $this->app->instance(EvaluationRunner::class, $runner = $this->jeuAvecCaptures(['captures/annonce.png']));
        $appels = [];
        $this->enregistrerAppels($appels);
        $runner->writeBaseline(UsageVisionDEssai::KEY, $runner->run(UsageVisionDEssai::KEY));

        $this->artisan('ai:eval', ['usage' => UsageVisionDEssai::KEY, '--role' => 'vision', '--update-baseline' => true])
            ->expectsOutputToContain('seul un --update-baseline complet')
            ->assertSuccessful();
    }
}
