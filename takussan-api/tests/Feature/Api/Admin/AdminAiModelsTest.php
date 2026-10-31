<?php

namespace Tests\Feature\Api\Admin;

use App\Models\AiCall;
use App\Models\AiModel;
use App\Models\AiRoleAssignment;
use App\Models\AiUsageSetting;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\User;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\Evaluation\FieldScorer;
use App\Services\Ai\ModelResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Laravel\Ai\Responses\Data\Meta;
use Laravel\Ai\Responses\Data\TextUsage;
use Laravel\Ai\Responses\StructuredTextResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\Ai\AgentDEssai;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/** TCK-2448 (ADR-0085 §1) — le catalogue des modèles depuis la console. */
class AdminAiModelsTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;
    use SocleIaDEssai;

    private string $racine;

    private const TARIFS = ['input' => '3', 'output' => '15', 'cache_read' => '0.3', 'cache_write' => '3.75'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        // Un modèle de la configuration qu'aucune chaîne de repli n'emploie.
        config(['ai.pricing.anthropic.modele-libre' => ['input' => '1', 'output' => '1', 'cache_read' => '0', 'cache_write' => '0']]);
    }

    protected function tearDown(): void
    {
        if (isset($this->racine)) {
            File::deleteDirectory($this->racine);
        }
        parent::tearDown();
    }

    /** Un rôle s'évalue sur un jeu de cas ; le job ne part pas, seul le geste de l'affectation compte. */
    private function avecUnJeuDeCas(): void
    {
        Queue::fake();
        $this->racine = storage_path('framework/testing/ai-evals-'.Str::random(8));
        File::ensureDirectoryExists($this->racine.'/'.UsageDEssai::KEY.'/cases');
        File::put($this->racine.'/'.UsageDEssai::KEY.'/cases/01.json', json_encode(['input' => 'Villa', 'expected' => ['titre' => 'Villa']]));
        $this->app->instance(EvaluationRunner::class, new EvaluationRunner(
            app(AiGateway::class), app(AiUsageRegistry::class), app(ModelResolver::class), new FieldScorer, $this->racine, $this->racine.'/rapports',
        ));
    }

    /** @param array<string, mixed> $extra */
    private function ajouter(string $model, array $extra = []): AiModel
    {
        $this->postJson('/api/admin/ai/models', $extra + ['provider' => 'anthropic', 'model' => $model] + self::TARIFS)->assertOk();

        return AiModel::query()->where('model', $model)->sole();
    }

    /** AC1 — sans changer la configuration. */
    public function test_a_model_added_in_the_console_can_be_assigned_forced_and_evaluated(): void
    {
        $this->avecUnJeuDeCas();
        $this->actingAsRole('super_admin');
        $avant = config('ai.pricing');

        $this->ajouter('modele-neuf');

        $this->putJson('/api/admin/ai/roles/redaction', ['chain' => [['provider' => 'anthropic', 'model' => 'modele-neuf']]])->assertOk();
        $this->patchJson('/api/admin/ai/usages/'.UsageDEssai::KEY, ['forced_provider' => 'anthropic', 'forced_model' => 'modele-neuf'])->assertOk();
        $this->postJson('/api/admin/ai/evaluations', ['role' => 'extraction', 'provider' => 'anthropic', 'model' => 'modele-neuf'])->assertStatus(202);
        $this->assertSame($avant, config('ai.pricing'));
        $this->assertContains('modele-neuf', $this->getJson('/api/admin/ai/providers')->json('data.0.models'));
    }

    /** AC2 */
    public function test_a_model_of_the_configuration_withdrawn_is_refused_and_stays_shown_as_withdrawn(): void
    {
        $this->avecUnJeuDeCas();
        $this->actingAsRole('super_admin');

        $this->ajouter('modele-libre', ['active' => false]);

        $this->putJson('/api/admin/ai/roles/redaction', ['chain' => [['provider' => 'anthropic', 'model' => 'modele-libre']]])->assertStatus(422)->assertJsonPath('code', 'ai.model_unpriced');
        $this->patchJson('/api/admin/ai/usages/'.UsageDEssai::KEY, ['forced_provider' => 'anthropic', 'forced_model' => 'modele-libre'])->assertStatus(422)->assertJsonPath('code', 'ai.model_unpriced');
        $this->postJson('/api/admin/ai/evaluations', ['role' => 'extraction', 'provider' => 'anthropic', 'model' => 'modele-libre'])->assertStatus(422)->assertJsonPath('code', 'ai.model_unpriced');
        $this->assertNotContains('modele-libre', $this->getJson('/api/admin/ai/providers')->json('data.0.models'));

        $ligne = collect($this->getJson('/api/admin/ai/models')->assertOk()->json('data'))->firstWhere('model', 'modele-libre');
        $this->assertFalse($ligne['active']);
        $this->assertSame('console', $ligne['origin']);
    }

    /** AC3 */
    public function test_withdrawing_a_model_in_use_is_refused_and_names_the_uses(): void
    {
        $this->actingAsRole('super_admin');
        $modele = AiModel::factory()->create(['model' => 'modele-neuf']);
        AiRoleAssignment::query()->create(['role' => 'redaction', 'chain' => [['provider' => 'anthropic', 'model' => 'modele-neuf', 'max_tokens' => null]]]);
        AiUsageSetting::query()->create(['usage_key' => 'essai.usage', 'forced_provider' => 'anthropic', 'forced_model' => 'modele-neuf']);

        $reponse = $this->patchJson('/api/admin/ai/models/'.$modele->id, ['active' => false])
            ->assertStatus(409)->assertJsonPath('code', 'ai.model_in_use');

        $this->assertSame(['roles' => ['redaction'], 'usages' => ['essai.usage'], 'fallback_roles' => []], $reponse->json('uses'));
        $this->assertStringContainsString('redaction', $reponse->json('message'));
        $this->assertStringContainsString('essai.usage', $reponse->json('message'));
        $this->assertTrue($modele->fresh()->active);
        $this->assertSame(0, Activity::query()->where('event', 'super_admin_ai_model_updated')->count());
    }

    /** AC3 — la chaîne de repli compte, et un rôle réglé en base ne l'efface pas : le retour à la configuration la rejouerait. */
    public function test_withdrawing_a_model_of_a_fallback_chain_is_refused(): void
    {
        $this->actingAsRole('super_admin');
        AiRoleAssignment::query()->create(['role' => 'extraction', 'chain' => [['provider' => 'anthropic', 'model' => 'modele-libre', 'max_tokens' => null]]]);

        $this->postJson('/api/admin/ai/models', ['provider' => 'anthropic', 'model' => 'modele-a', 'active' => false] + self::TARIFS)
            ->assertStatus(409)->assertJsonPath('uses.fallback_roles', ['extraction']);

        $this->assertSame(0, AiModel::query()->count());
    }

    public function test_a_withdrawn_model_can_be_restored(): void
    {
        $this->actingAsRole('super_admin');
        $modele = AiModel::factory()->create(['model' => 'modele-neuf', 'active' => false]);

        $this->patchJson('/api/admin/ai/models/'.$modele->id, ['active' => true])->assertOk();

        $this->assertTrue($modele->fresh()->active);
    }

    /** AC4 */
    public function test_a_corrected_price_changes_the_next_calls_and_never_the_past_ones(): void
    {
        $operateur = $this->actingAsRole('super_admin');
        AgentDEssai::fake(fn (string $p, $a, $provider, string $model) => new StructuredTextResponse(['titre' => 'Villa', 'prix' => 100], '{}', new TextUsage(1_000_000, 0), new Meta('anthropic', $model)));
        // Une entrée neuve à chaque appel : l'usage d'essai met ses réponses en cache.
        $appel = fn () => app(AiGateway::class)->run(new AiRequest(UsageDEssai::KEY, Str::random(), actor: $operateur));

        $avant = $appel()->call;
        $this->assertSame('2', $avant->cost_estimate_usd);

        $this->postJson('/api/admin/ai/models', ['provider' => 'anthropic', 'model' => 'modele-a', 'input' => '5', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0'])->assertOk();
        $this->assertSame('5', $appel()->call->cost_estimate_usd);

        $modele = AiModel::query()->where('model', 'modele-a')->sole();
        $this->patchJson('/api/admin/ai/models/'.$modele->id, ['input' => '0.5'])->assertOk();
        $this->assertSame('0.5', $appel()->call->fresh()->cost_estimate_usd);

        $this->assertSame('2', $avant->fresh()->cost_estimate_usd);
        $this->assertSame(['2', '5', '0.5'], AiCall::query()->orderBy('id')->pluck('cost_estimate_usd')->all());
    }

    /** AC5 */
    public function test_a_zero_price_is_accepted_and_a_missing_one_is_refused(): void
    {
        $this->actingAsRole('super_admin');

        $this->ajouter('modele-gratuit', ['input' => '0', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0']);
        $this->assertSame('0', AiModel::query()->where('model', 'modele-gratuit')->sole()->input);

        foreach (array_keys(self::TARIFS) as $tarif) {
            $sans = array_diff_key(self::TARIFS, [$tarif => true]);
            $this->postJson('/api/admin/ai/models', ['provider' => 'anthropic', 'model' => 'modele-partiel'] + $sans)->assertStatus(422)->assertJsonValidationErrors($tarif);
            $this->postJson('/api/admin/ai/models', ['provider' => 'anthropic', 'model' => 'modele-partiel', $tarif => null] + $sans)->assertStatus(422)->assertJsonValidationErrors($tarif);
        }
        $modele = AiModel::query()->where('model', 'modele-gratuit')->sole();
        $this->patchJson('/api/admin/ai/models/'.$modele->id, ['input' => null])->assertStatus(422)->assertJsonValidationErrors('input');
    }

    /** ADR-0086 — un nombre JSON a déjà perdu ses chiffres, un exposant ou un signe n'est pas un montant. */
    public function test_a_price_is_a_decimal_string_and_nothing_else(): void
    {
        $this->actingAsRole('super_admin');

        foreach ([4.0e-11, 3, '4e-11', '-1', '1,5', 'NaN', '.5', '1.'] as $tarif) {
            $this->postJson('/api/admin/ai/models', ['provider' => 'anthropic', 'model' => 'modele-x', 'input' => $tarif] + self::TARIFS)
                ->assertStatus(422)->assertJsonValidationErrors('input');
        }
    }

    public function test_an_undeclared_provider_a_duplicate_and_a_spaced_identifier_are_refused(): void
    {
        $this->actingAsRole('super_admin');
        AiModel::factory()->create(['model' => 'modele-neuf']);

        $this->postJson('/api/admin/ai/models', ['provider' => 'openai', 'model' => 'modele-x'] + self::TARIFS)->assertStatus(422)->assertJsonValidationErrors('provider');
        $this->postJson('/api/admin/ai/models', ['provider' => 'anthropic', 'model' => 'modele-neuf'] + self::TARIFS)->assertStatus(422)->assertJsonValidationErrors('model');
        $this->postJson('/api/admin/ai/models', ['provider' => 'anthropic', 'model' => 'modele neuf'] + self::TARIFS)->assertStatus(422)->assertJsonValidationErrors('model');
        $this->patchJson('/api/admin/ai/models/999999', ['active' => false])->assertNotFound();
    }

    /** AC6 */
    public function test_writes_need_the_gesture_and_a_recent_second_factor(): void
    {
        $modele = AiModel::factory()->create(['model' => 'modele-neuf']);
        $corps = ['provider' => 'anthropic', 'model' => 'modele-x'] + self::TARIFS;

        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->postJson('/api/admin/ai/models', $corps)->assertStatus(403)->assertJsonPath('code', 'platform.ability_missing');
        $this->patchJson('/api/admin/ai/models/'.$modele->id, ['input' => '9'])->assertStatus(403)->assertJsonPath('code', 'platform.ability_missing');

        $user = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($user, 'super_admin');
        $this->actingAs($user);
        $this->getJson('/api/admin/ai/models')->assertOk();
        $this->postJson('/api/admin/ai/models', $corps)->assertStatus(403)->assertJsonPath('code', 'two_factor_step_up_required');
        $this->patchJson('/api/admin/ai/models/'.$modele->id, ['input' => '9'])->assertStatus(403)->assertJsonPath('code', 'two_factor_step_up_required');

        $this->assertSame('1', $modele->fresh()->input);
        $this->assertSame(1, AiModel::query()->count());
    }

    /** AC6 */
    public function test_each_accepted_write_is_journaled_with_the_price_before_and_after(): void
    {
        $operateur = $this->actingAsRole('super_admin');

        $modele = $this->ajouter('modele-libre', ['input' => '9']);
        $cree = Activity::query()->where('event', 'super_admin_ai_model_created')->sole();
        $this->assertSame('Admin', $cree->log_name);
        $this->assertSame($operateur->id, $cree->causer_id);
        $this->assertSame('1', $cree->properties['before']['input']);
        $this->assertSame('9', $cree->properties['after']['input']);

        $this->patchJson('/api/admin/ai/models/'.$modele->id, ['input' => '0.00000000004', 'active' => false])->assertOk();
        $modifie = Activity::query()->where('event', 'super_admin_ai_model_updated')->sole();
        $this->assertSame('9', $modifie->properties['before']['input']);
        $this->assertTrue($modifie->properties['before']['active']);
        $this->assertSame('0.00000000004', $modifie->properties['after']['input']);
        $this->assertFalse($modifie->properties['after']['active']);
    }

    /** AC7 */
    public function test_an_identifier_of_120_characters_is_stored_assigned_and_journaled_untruncated(): void
    {
        $operateur = $this->actingAsRole('super_admin');
        $identifiant = 'editeur/'.str_repeat('m', 120 - strlen('editeur/') - strlen(':gratuit')).':gratuit';
        $this->assertSame(120, strlen($identifiant));
        $this->ajouter($identifiant);

        $this->putJson('/api/admin/ai/roles/extraction', ['chain' => [['provider' => 'anthropic', 'model' => $identifiant]]])->assertOk();
        $this->patchJson('/api/admin/ai/usages/'.UsageDEssai::KEY, ['forced_provider' => 'anthropic', 'forced_model' => $identifiant])->assertOk();
        $this->assertSame($identifiant, AiUsageSetting::query()->sole()->forced_model);
        AiUsageSetting::query()->delete();

        AgentDEssai::fake(fn () => ['titre' => 'Villa', 'prix' => 100]);
        app(AiGateway::class)->run(new AiRequest(UsageDEssai::KEY, 'x', actor: $operateur));

        $this->assertSame($identifiant, AiCall::query()->sole()->model);
    }

    /** AC7 — la borne des colonnes et des requêtes est la même ; au-delà, un refus et non une erreur SQL. */
    public function test_an_identifier_of_255_characters_fits_and_the_next_one_is_refused(): void
    {
        $this->avecUnJeuDeCas();
        $this->actingAsRole('super_admin');
        $long = str_repeat('m', 255);
        $this->ajouter($long);

        $this->putJson('/api/admin/ai/roles/redaction', ['chain' => [['provider' => 'anthropic', 'model' => $long]]])->assertOk();
        $this->postJson('/api/admin/ai/evaluations', ['role' => 'extraction', 'provider' => 'anthropic', 'model' => $long])->assertStatus(202);
        $this->postJson('/api/admin/ai/models', ['provider' => 'anthropic', 'model' => $long.'m'] + self::TARIFS)->assertStatus(422)->assertJsonValidationErrors('model');
        AiCall::query()->create(['usage_key' => UsageDEssai::KEY, 'outcome' => 'success', 'model' => $long]);
    }

    public function test_the_listing_gives_the_prices_in_strings_and_the_display_rate(): void
    {
        $this->actingAsRole('super_admin');
        AiModel::factory()->create(['model' => 'modele-infime', 'input' => '0.00000000004']);

        $reponse = $this->getJson('/api/admin/ai/models')->assertOk();

        $this->assertSame('600', $reponse->json('meta.usd_to_xof'));
        $this->assertSame('0.00000000004', collect($reponse->json('data'))->firstWhere('model', 'modele-infime')['input']);
    }
}
