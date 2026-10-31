<?php

namespace Tests\Feature\Ai;

use App\Models\AiCall;
use App\Models\AiRoleAssignment;
use App\Models\AiUsageSetting;
use App\Models\Enums\AiCallOutcome;
use App\Services\Admin\HealthcheckService;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiProviderCatalogue;
use App\Services\Ai\AiRequest;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\Evaluation\FieldScorer;
use App\Services\Ai\Exceptions\AiUnavailable;
use App\Services\Ai\ModelLink;
use App\Services\Ai\ModelResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/**
 * TCK-2450 (ADR-0085 §3, §4) — un fournisseur n'est sélectionnable que déclaré, avec une clé et une adresse sur un
 * hôte accepté. Éprouvé sans réseau : tout envoi passe par `Http::fake`, et un envoi non prévu lève.
 */
class AiProviderSelectabilityTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private const CLE = 'sk-valeur-de-test-a-ne-jamais-rendre';

    private const TARIFS = ['input' => '3', 'output' => '15', 'cache_read' => '0.3', 'cache_write' => '0'];

    /** @var list<string> les hôtes qui ont reçu une requête */
    private array $hotes = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        Http::preventStrayRequests();
        Http::fake(function (Request $requete) {
            $this->hotes[] = (string) parse_url($requete->url(), PHP_URL_HOST);

            return Http::response(str_ends_with($requete->url(), '/messages')
                ? [
                    'id' => 'm', 'type' => 'message', 'role' => 'assistant', 'model' => 'modele-a', 'stop_reason' => 'end_turn',
                    'content' => [['type' => 'text', 'text' => '{"titre":"Villa"}']], 'usage' => ['input_tokens' => 10, 'output_tokens' => 2],
                ]
                : [
                    'id' => 'r', 'model' => 'modele-o', 'status' => 'completed',
                    'output' => [['type' => 'message', 'role' => 'assistant', 'content' => [['type' => 'output_text', 'text' => '{"titre":"Villa","prix":1}']]]],
                    'usage' => ['input_tokens' => 100, 'output_tokens' => 20, 'input_tokens_details' => ['cached_tokens' => 40]],
                ]);
        });
    }

    private function catalogue(): AiProviderCatalogue
    {
        return app(AiProviderCatalogue::class);
    }

    /** @return array<string, mixed> */
    private function decrit(string $fournisseur): array
    {
        return collect($this->catalogue()->describe())->firstWhere('key', $fournisseur);
    }

    private function openaiAvecCle(?string $url = null): void
    {
        config(['ai.providers.openai.key' => self::CLE]);
        if ($url !== null) {
            config(['ai.providers.openai.url' => $url]);
        }
    }

    public function test_sans_cle_le_fournisseur_est_affiche_et_non_selectionnable(): void
    {
        $this->assertSame(
            ['key_present' => false, 'selectable' => false, 'reason' => 'key_missing', 'host' => 'api.openai.com'],
            array_intersect_key($this->decrit('openai'), array_flip(['key_present', 'selectable', 'reason', 'host'])),
        );
    }

    public function test_avec_la_cle_et_l_adresse_par_defaut_il_est_selectionnable(): void
    {
        $this->openaiAvecCle();
        config(['ai.providers.openrouter.key' => self::CLE]);

        $this->assertSame([true, null], [$this->decrit('openai')['selectable'], $this->decrit('openai')['reason']]);
        $this->assertTrue($this->decrit('openrouter')['selectable']);
        $this->assertSame(['anthropic', 'openai', 'openrouter'], $this->catalogue()->selectableKeys());
    }

    /** @return array<string, array{string}> */
    public static function adressesRefusees(): array
    {
        return [
            'autre hôte' => ['https://proxy.example.test/v1'],
            'sous-domaine, pas de joker' => ['https://eu.api.openai.com/v1'],
            'suffixe' => ['https://api.openai.com.example.test/v1'],
            'identifiants devant l\'hôte accepté' => ['https://api.openai.com@example.test/v1'],
            'identifiants sur l\'hôte accepté' => ['https://moi:secret@api.openai.com/v1'],
            'barre inverse' => ['https://example.test\\@api.openai.com/v1'],
            'espace' => ['https://api.openai.com /v1'],
            'sans schéma' => ['api.openai.com/v1'],
            'autre schéma' => ['ftp://api.openai.com/v1'],
            'autre port' => ['https://api.openai.com:8443/v1'],
            'port zéro' => ['https://api.openai.com:0/v1'],
            'port du schéma voisin' => ['https://api.openai.com:80/v1'],
        ];
    }

    #[DataProvider('adressesRefusees')]
    public function test_une_adresse_hors_de_ses_hotes_rend_le_fournisseur_non_selectionnable(string $url): void
    {
        $this->openaiAvecCle($url);

        $this->assertFalse($this->decrit('openai')['selectable'], $url);
        $this->assertSame('host_not_allowed', $this->decrit('openai')['reason'], $url);
    }

    public function test_la_casse_de_l_hote_ne_compte_pas_et_seul_l_hote_sort(): void
    {
        $this->openaiAvecCle('https://API.OpenAI.com/v1');
        $this->assertTrue($this->decrit('openai')['selectable']);

        $this->openaiAvecCle('https://proxy.example.test/chemin-prive?jeton=secret');
        $decrit = json_encode($this->decrit('openai'));
        $this->assertSame('proxy.example.test', $this->decrit('openai')['host']);
        $this->assertStringNotContainsString('chemin-prive', $decrit);
        $this->assertStringNotContainsString('jeton', $decrit);
        $this->assertStringNotContainsString(self::CLE, $decrit);
    }

    /** TCK-2423 + TCK-2450 — le catalogue : une clé sans la déclaration du refus de l'entraînement n'est pas sélectionnable. Le test de connexion est éprouvé par `AdminAiProvidersTest`. */
    public function test_voyage_sans_la_declaration_n_est_pas_selectionnable(): void
    {
        config(['ai.providers.voyageai.key' => 'k', 'ai.providers.voyageai.training_opt_out' => false]);
        $this->assertSame('training_opt_out_undeclared', $this->decrit('voyageai')['reason']);
        $this->assertSame('ai.provider_unreachable', $this->catalogue()->refusalCode('voyageai'));
        $this->assertFalse($this->catalogue()->reachable('voyageai'));

        config(['ai.providers.voyageai.training_opt_out' => true]);
        $this->assertTrue($this->catalogue()->selectable('voyageai'));
        $this->assertTrue($this->catalogue()->reachable('voyageai'));

        config(['ai.providers.voyageai.url' => 'https://api.voyageai.com:8443/v1']);
        $this->assertFalse($this->catalogue()->reachable('voyageai'), 'le port se compare aussi pour les embeddings');
    }

    /** La sonde juge l'adresse : l'absence de déclaration ne masque pas une clé posée sur un mauvais hôte. */
    public function test_la_sonde_voit_un_mauvais_hote_meme_sans_la_declaration(): void
    {
        config(['ai.providers.voyageai.key' => 'k', 'ai.providers.voyageai.training_opt_out' => false]);
        $this->assertFalse($this->catalogue()->anyKeyedWithRefusedAddress(), 'la bonne adresse, sans déclaration');

        config(['ai.providers.voyageai.url' => 'https://ailleurs.example/v1']);
        $this->assertTrue($this->catalogue()->anyKeyedWithRefusedAddress());
    }

    /** Le port se compare : celui du schéma ne change rien, un autre s'écrit dans la liste. */
    public function test_un_port_hors_du_schema_doit_etre_ecrit_dans_la_liste(): void
    {
        $this->openaiAvecCle('https://api.openai.com:443/v1');
        $this->assertTrue($this->decrit('openai')['selectable'], 'le port de https');

        $this->openaiAvecCle('https://api.openai.com:8443/v1');
        $this->assertSame('api.openai.com:8443', $this->decrit('openai')['host']);

        config(['ai.providers.openai.allowed_hosts' => ['api.openai.com:8443']]);
        $this->assertTrue($this->decrit('openai')['selectable'], 'écrit dans la liste');

        $this->openaiAvecCle('https://api.openai.com/v1');
        $this->assertFalse($this->decrit('openai')['selectable'], 'la liste nomme ce port seul');
    }

    public function test_http_n_est_accepte_qu_en_local_et_en_test(): void
    {
        $this->openaiAvecCle('http://api.openai.com/v1');
        $this->assertTrue($this->catalogue()->selectable('openai'), 'testing');

        foreach (['production', 'staging', 'preview'] as $environnement) {
            $this->app['env'] = $environnement;
            $this->assertSame('host_not_allowed', $this->catalogue()->unselectableReason('openai'), $environnement);
        }
        $this->openaiAvecCle('https://api.openai.com/v1');
        $this->assertNull($this->catalogue()->unselectableReason('openai'), 'https en production');
        $this->app['env'] = 'local';
        $this->openaiAvecCle('http://api.openai.com/v1');
        $this->assertNull($this->catalogue()->unselectableReason('openai'), 'local');
    }

    public function test_une_entree_sans_hotes_ou_sans_adresse_n_est_pas_selectionnable(): void
    {
        config(['ai.providers.nu' => ['driver' => 'openai-compatible', 'key' => 'k', 'url' => 'https://nu.test/v1']]);
        config(['ai.providers.sans-adresse' => ['driver' => 'openai', 'key' => 'k', 'allowed_hosts' => ['api.openai.com']]]);

        $this->assertSame('host_not_allowed', $this->catalogue()->unselectableReason('nu'));
        $this->assertSame('host_not_allowed', $this->catalogue()->unselectableReason('sans-adresse'));
    }

    /** Une clé vide de `.env.example` ne doit pas écraser l'adresse par défaut : `env($cle, $defaut)` y rendrait ''. */
    public function test_une_adresse_vide_dans_l_environnement_garde_celle_du_fournisseur(): void
    {
        $noms = ['ANTHROPIC_URL', 'OPENAI_URL', 'OPENROUTER_URL', 'VOYAGE_URL'];
        foreach ($noms as $nom) {
            $_ENV[$nom] = $_SERVER[$nom] = '';
        }
        try {
            $lu = require config_path('ai.php');
        } finally {
            foreach ($noms as $nom) {
                unset($_ENV[$nom], $_SERVER[$nom]);
            }
        }

        $this->assertSame('https://api.anthropic.com/v1', $lu['providers']['anthropic']['url']);
        $this->assertSame('https://api.openai.com/v1', $lu['providers']['openai']['url']);
        $this->assertSame('https://openrouter.ai/api/v1', $lu['providers']['openrouter']['url']);
        $this->assertSame('https://api.voyageai.com/v1', $lu['providers']['voyageai']['url']);
    }

    /** Le double de la passerelle reste dans la configuration jusqu'à la fin du processus. */
    public function test_le_double_n_apparait_jamais_comme_un_fournisseur_et_est_refuse(): void
    {
        $double = 'anthropic'.AiGateway::TOOL_OUTPUT_SUFFIX;
        config(["ai.providers.{$double}" => config('ai.providers.anthropic')]);
        config(["ai.pricing.{$double}" => ['modele-d' => self::TARIFS]]);
        $this->actingAsRole('super_admin');

        $this->assertNotContains($double, array_column($this->catalogue()->describe(), 'key'));
        $this->assertNotContains($double, $this->catalogue()->selectableKeys());
        $this->assertFalse($this->catalogue()->has($double));
        $this->postJson("/api/admin/ai/providers/{$double}/test")->assertStatus(404);
        $this->putJson('/api/admin/ai/roles/redaction', ['chain' => [['provider' => $double, 'model' => 'modele-d']]])->assertUnprocessable()->assertJsonValidationErrors('chain.0.provider');
        $this->patchJson('/api/admin/ai/usages/'.UsageDEssai::KEY, ['forced_provider' => $double, 'forced_model' => 'modele-d'])->assertUnprocessable()->assertJsonValidationErrors('forced_provider');
        $this->postJson('/api/admin/ai/evaluations', ['role' => 'extraction', 'provider' => $double, 'model' => 'modele-d'])->assertUnprocessable()->assertJsonValidationErrors('provider');
        $this->postJson('/api/admin/ai/models', ['provider' => $double, 'model' => 'modele-e'] + self::TARIFS)->assertUnprocessable()->assertJsonValidationErrors('provider');
        $this->assertNotContains($double, array_column($this->getJson('/api/admin/ai/models')->assertOk()->json('data'), 'provider'));
    }

    /** @return array<string, array{array<string, mixed>}> */
    public static function etatsNonSelectionnables(): array
    {
        return [
            'clé absente' => [['ai.providers.openai.key' => null]],
            'hôte hors liste' => [['ai.providers.openai.key' => self::CLE, 'ai.providers.openai.url' => 'https://proxy.example.test/v1']],
        ];
    }

    /**
     * AC2, AC3 — chaque point d'écriture, y compris pour un modèle déjà au catalogue : le refus vient bien du
     * fournisseur, pas de l'absence de tarif.
     *
     * @param  array<string, mixed>  $etat
     */
    #[DataProvider('etatsNonSelectionnables')]
    public function test_chaque_point_d_ecriture_refuse_un_fournisseur_non_selectionnable(array $etat): void
    {
        $this->actingAsRole('super_admin');
        $this->openaiAvecCle();
        $this->postJson('/api/admin/ai/models', ['provider' => 'openai', 'model' => 'modele-o'] + self::TARIFS)->assertOk();
        config($etat);

        $this->putJson('/api/admin/ai/roles/redaction', ['chain' => [['provider' => 'openai', 'model' => 'modele-o']]])->assertUnprocessable()->assertJsonValidationErrors('chain.0.provider');
        $this->patchJson('/api/admin/ai/usages/'.UsageDEssai::KEY, ['forced_provider' => 'openai', 'forced_model' => 'modele-o'])->assertUnprocessable()->assertJsonValidationErrors('forced_provider');
        $this->postJson('/api/admin/ai/evaluations', ['role' => 'extraction', 'provider' => 'openai', 'model' => 'modele-o'])->assertUnprocessable()->assertJsonValidationErrors('provider');
        $this->postJson('/api/admin/ai/models', ['provider' => 'openai', 'model' => 'modele-neuf'] + self::TARIFS)->assertUnprocessable()->assertJsonValidationErrors('provider');

        $this->assertNull(AiRoleAssignment::query()->where('role', 'redaction')->first());
        $this->assertNull(AiUsageSetting::query()->where('usage_key', UsageDEssai::KEY)->first());
        $this->assertSame([], $this->hotes);
    }

    /** La raison se lit : ni la clé ni l'adresse, et le message dit laquelle des deux manque. */
    public function test_le_refus_nomme_sa_raison_sans_rien_exposer(): void
    {
        $this->actingAsRole('super_admin');

        $this->putJson('/api/admin/ai/roles/redaction', ['chain' => [['provider' => 'openai', 'model' => 'm']]])
            ->assertUnprocessable()->assertJsonFragment([trans('errors.ai.provider_key_missing')]);
        $this->openaiAvecCle('https://proxy.example.test/chemin-prive');
        $reponse = $this->putJson('/api/admin/ai/roles/redaction', ['chain' => [['provider' => 'openai', 'model' => 'm']]])
            ->assertUnprocessable()->assertJsonFragment([trans('errors.ai.provider_host_not_allowed')]);
        $this->assertStringNotContainsString('chemin-prive', $reponse->getContent());
        $this->assertStringNotContainsString(self::CLE, $reponse->getContent());
    }

    /** Corriger un modèle de la configuration n'en ajoute aucun, et la passerelle ne l'appellera pas pour autant. */
    public function test_un_modele_de_la_configuration_se_corrige_sans_cle(): void
    {
        $this->actingAsRole('super_admin');
        config(['ai.providers.anthropic.key' => null]);

        $this->postJson('/api/admin/ai/models', ['provider' => 'anthropic', 'model' => 'modele-a'] + self::TARIFS)->assertOk();
        $this->postJson('/api/admin/ai/models', ['provider' => 'anthropic', 'model' => 'modele-neuf'] + self::TARIFS)->assertUnprocessable()->assertJsonValidationErrors('provider');
    }

    /** AC1 — clé posée : le modèle s'ajoute, s'affecte, et la passerelle l'appelle à l'adresse par défaut. */
    public function test_ac1_openai_avec_sa_cle_s_ajoute_s_affecte_et_recoit_l_appel(): void
    {
        $this->actingAsRole('super_admin');
        $this->openaiAvecCle();

        $this->postJson('/api/admin/ai/models', ['provider' => 'openai', 'model' => 'modele-o'] + self::TARIFS)->assertOk();
        $this->putJson('/api/admin/ai/roles/extraction', ['chain' => [['provider' => 'openai', 'model' => 'modele-o', 'max_tokens' => 100]]])->assertOk();

        $resultat = app(AiGateway::class)->run(new AiRequest(UsageDEssai::KEY, 'Une villa.', evaluation: true));

        $this->assertSame(['api.openai.com'], $this->hotes);
        $this->assertSame(['titre' => 'Villa', 'prix' => 1], $resultat->structured);
        $this->assertSame(['openai', 'modele-o', AiCallOutcome::Success], [$resultat->call->provider, $resultat->call->model, $resultat->call->outcome]);
        // ADR-0086 — OpenAI compte le cache dans `input_tokens` : 60 au tarif d'entrée, 40 en lecture de cache, 20 en sortie.
        $this->assertSame(0, bccomp('0.000492', (string) $resultat->call->cost_estimate_usd, 12));
    }

    /**
     * AC2, AC3 — une chaîne en base qui nomme un fournisseur devenu non sélectionnable : rien ne part chez lui.
     *
     * @param  array<string, mixed>  $etat
     */
    #[DataProvider('etatsNonSelectionnables')]
    public function test_une_chaine_en_base_bascule_au_maillon_suivant_sans_appel(array $etat): void
    {
        config($etat);
        config(['ai.providers.anthropic.url' => 'https://secours.test/v1', 'ai.providers.anthropic.allowed_hosts' => ['secours.test']]);
        AiRoleAssignment::query()->create(['role' => 'extraction', 'chain' => [
            ['provider' => 'openai', 'model' => 'modele-o', 'max_tokens' => 100],
            ['provider' => 'anthropic', 'model' => 'modele-a', 'max_tokens' => 100],
        ]]);

        $resultat = app(AiGateway::class)->run(new AiRequest(UsageDEssai::KEY, 'Une villa.', evaluation: true));

        $this->assertSame('anthropic', $resultat->call->provider);
        $this->assertSame(['secours.test'], $this->hotes);
        $code = $etat['ai.providers.openai.key'] === null ? 'ai.provider_key_missing' : 'ai.provider_host_not_allowed';
        $this->assertSame(
            [['openai', AiCallOutcome::FailedOver, $code], ['anthropic', AiCallOutcome::Success, null]],
            AiCall::query()->orderBy('id')->get()->map(fn (AiCall $a) => [$a->provider, $a->outcome, $a->error_code])->all(),
        );
    }

    public function test_sur_le_dernier_maillon_l_usage_est_indisponible_et_en_porte_la_cause(): void
    {
        foreach (['modele' => new ModelLink('openai', 'modele-o', 100), 'inconnu' => new ModelLink('retire', 'modele-o', 100)] as $maillon) {
            try {
                app(AiGateway::class)->run(new AiRequest(UsageDEssai::KEY, 'Une villa.', link: $maillon, evaluation: true));
                $this->fail('un fournisseur non sélectionnable ne doit pas répondre');
            } catch (AiUnavailable $e) {
                $this->assertSame('ai.providers_unavailable', $e->getMessage());
                $this->assertSame($maillon->provider === 'openai' ? 'ai.provider_key_missing' : 'ai.provider_unknown', $e->getPrevious()?->getMessage());
            }
        }
        $this->assertSame([], $this->hotes);
    }

    /** Le test de connexion est un envoi comme un autre. */
    public function test_le_test_de_connexion_ne_joint_aucun_hote_hors_liste(): void
    {
        $this->actingAsRole('super_admin');
        $this->openaiAvecCle('https://proxy.example.test/v1');
        config(['ai.pricing.openai.modele-o' => self::TARIFS]);

        $this->postJson('/api/admin/ai/providers/openai/test')->assertStatus(422)->assertJsonPath('code', 'ai.provider_host_not_allowed');
        config(['ai.providers.openai.key' => null]);
        $this->postJson('/api/admin/ai/providers/openai/test')->assertStatus(422)->assertJsonPath('code', 'ai.provider_key_missing');

        $this->assertSame([], $this->hotes);
    }

    /** La console voit l'état et l'hôte. Aucune route ne rend ni la clé ni l'adresse. */
    public function test_aucune_route_de_lecture_ne_rend_la_cle_ni_l_adresse(): void
    {
        $this->actingAsRole('super_admin');
        $this->openaiAvecCle('https://proxy.example.test/chemin-prive');

        foreach (['/api/admin/ai/providers', '/api/admin/ai/roles', '/api/admin/ai/usages', '/api/admin/ai/models'] as $route) {
            $contenu = $this->getJson($route)->assertOk()->getContent();
            $this->assertStringNotContainsString(self::CLE, $contenu, $route);
            $this->assertStringNotContainsString('chemin-prive', $contenu, $route);
        }
    }

    /** AC2 — la sonde signale la clé posée sur une adresse refusée, par son motif seul : `viewer` la lit, pas la console des fournisseurs. */
    public function test_la_sonde_de_sante_signale_une_adresse_non_acceptee(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        config(['media-library.public_disk_name' => 'public', 'media-library.disk_name' => 'local']);

        $sonde = app(HealthcheckService::class)->refresh()['ai_providers'];
        $this->assertSame('ok', $sonde['status'], 'une clé absente n\'est pas un défaut');
        $this->assertArrayNotHasKey('reason', $sonde);

        $this->openaiAvecCle('https://proxy.example.test/chemin-prive');
        $sonde = app(HealthcheckService::class)->refresh()['ai_providers'];

        $this->assertSame('degraded', $sonde['status']);
        $this->assertSame('ai_provider_host_not_allowed', $sonde['reason']);
        $this->assertArrayNotHasKey('providers', $sonde);
        $this->assertStringNotContainsString('proxy.example.test', json_encode($sonde));
        $this->assertStringNotContainsString('chemin-prive', json_encode($sonde));
        $this->assertStringNotContainsString(self::CLE, json_encode($sonde));
    }

    public function test_ai_eval_refuse_un_candidat_non_selectionnable_et_ne_joue_rien_sans_fournisseur(): void
    {
        Queue::fake();
        $racine = storage_path('framework/testing/ai-evals-'.Str::random(8));
        File::ensureDirectoryExists($racine.'/'.UsageDEssai::KEY.'/cases');
        File::put($racine.'/'.UsageDEssai::KEY.'/cases/01.json', json_encode(['input' => 'Villa', 'expected' => ['titre' => 'Villa']]));
        $this->app->instance(EvaluationRunner::class, new EvaluationRunner(
            app(AiGateway::class), app(AiUsageRegistry::class), app(ModelResolver::class), new FieldScorer, $racine, $racine.'/rapports',
        ));
        config(['ai.pricing.openai.modele-o' => self::TARIFS]);

        try {
            $this->artisan('ai:eval', ['usage' => UsageDEssai::KEY, '--model' => 'openai/modele-o'])
                ->expectsOutputToContain('ai.provider_key_missing')->assertExitCode(2);

            // Le double d'un appel précédent garde une clé : il ne compte pas pour un fournisseur.
            config(['ai.providers.anthropic'.AiGateway::TOOL_OUTPUT_SUFFIX => config('ai.providers.anthropic')]);
            config(['ai.providers.anthropic.key' => null]);
            $this->artisan('ai:eval', ['--all' => true])
                ->expectsOutputToContain('rien à évaluer')->assertExitCode(0);
        } finally {
            File::deleteDirectory($racine);
        }
        $this->assertSame([], $this->hotes);
    }
}
