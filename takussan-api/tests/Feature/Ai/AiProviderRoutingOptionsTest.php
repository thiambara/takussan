<?php

namespace Tests\Feature\Ai;

use App\Ai\Usages\RadarExtractionUsage;
use App\Models\Enums\AiDataClass;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\ModelLink;
use App\Services\Ai\PromptRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\Ai\AgentSchemas;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/**
 * TCK-2450 — ce que `privacy.ts` § 4.3 promet se lit dans le corps réellement envoyé, derrière la vraie passerelle,
 * pour chaque pilote. Sans réseau : ce test dit ce qu'on envoie, pas ce qu'un fournisseur en fait.
 */
class AiProviderRoutingOptionsTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    /** @var array<string, list<array<string, mixed>>> les corps reçus, par hôte */
    private array $corps = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        Http::preventStrayRequests();
        Http::fake(function (Request $requete) {
            $this->corps[(string) parse_url($requete->url(), PHP_URL_HOST)][] = json_decode($requete->body(), true);

            return Http::response(match (true) {
                str_ends_with($requete->url(), '/responses') => ['id' => 'r', 'model' => 'm', 'status' => 'completed', 'output' => [['type' => 'message', 'role' => 'assistant', 'content' => [['type' => 'output_text', 'text' => '{"a":1}']]]], 'usage' => ['input_tokens' => 1, 'output_tokens' => 1]],
                str_ends_with($requete->url(), '/messages') => ['id' => 'm', 'type' => 'message', 'role' => 'assistant', 'model' => 'm', 'stop_reason' => 'end_turn', 'content' => [['type' => 'text', 'text' => '{"a":1}']], 'usage' => ['input_tokens' => 1, 'output_tokens' => 1]],
                default => ['id' => 'c', 'model' => 'm', 'choices' => [['message' => ['role' => 'assistant', 'content' => '{"a":1}'], 'finish_reason' => 'stop']], 'usage' => ['prompt_tokens' => 1, 'completion_tokens' => 1]],
            });
        });
    }

    /** @return array<string, mixed> le corps de l'unique requête reçue par l'hôte */
    private function jouer(string $entree, string $hote, string $texte = 'Une annonce.'): array
    {
        app(AiGateway::class)->run(new AiRequest(UsageDEssai::KEY, $texte, [AiDataClass::Publique], link: new ModelLink($entree, 'modele-a', 100), evaluation: true));
        $this->assertCount(1, $this->corps[$hote] ?? []);

        return $this->corps[$hote][0];
    }

    /** @param array<string, mixed> $reglages */
    private function declarer(string $entree, string $pilote, array $reglages = []): void
    {
        config(["ai.providers.{$entree}" => $reglages + ['driver' => $pilote, 'key' => 'k', 'url' => "https://{$entree}.test/v1", 'allowed_hosts' => ["{$entree}.test"]]]);
    }

    public function test_ac4_l_entree_livree_openrouter_porte_deny_et_require_parameters(): void
    {
        config(['ai.providers.openrouter.key' => 'k']);

        $corps = $this->jouer('openrouter', 'openrouter.ai');

        $this->assertSame(['data_collection' => 'deny', 'require_parameters' => true], $corps['provider']);
    }

    /** AC4 — `deny` n'est pas écrit en dur : la configuration décide, et une valeur posée sur l'entrée passe. */
    public function test_ac4_la_valeur_de_la_configuration_est_celle_envoyee(): void
    {
        config(['ai.providers.openrouter.key' => 'k', 'ai.providers.openrouter.provider' => ['data_collection' => 'allow', 'require_parameters' => false, 'zdr' => true]]);

        $this->assertSame(['data_collection' => 'allow', 'require_parameters' => false, 'zdr' => true], $this->jouer('openrouter', 'openrouter.ai')['provider']);
    }

    /** Le trou connu : `providerOptions()` ne reçoit que le pilote. Une entrée renommée garde ses options. */
    public function test_une_entree_openrouter_renommee_porte_son_reglage(): void
    {
        $this->declarer('mon-routeur', 'openrouter', ['provider' => ['data_collection' => 'allow']]);

        $corps = $this->jouer('mon-routeur', 'mon-routeur.test');

        $this->assertSame(['data_collection' => 'allow', 'require_parameters' => true], $corps['provider']);
    }

    /** Une entrée renommée qui ne déclare rien ne perd pas la promesse : `deny`. */
    public function test_une_entree_openrouter_renommee_sans_reglage_reste_a_deny(): void
    {
        $this->declarer('autre-routeur', 'openrouter');

        $this->assertSame(['data_collection' => 'deny', 'require_parameters' => true], $this->jouer('autre-routeur', 'autre-routeur.test')['provider']);
    }

    public function test_l_entree_livree_openai_envoie_store_false(): void
    {
        config(['ai.providers.openai.key' => 'k']);

        $this->assertFalse($this->jouer('openai', 'api.openai.com')['store']);
    }

    /** Même sans `store` déclaré, ou avec `store` à vrai : le pilote décide, jamais le nom ni un oubli. */
    public function test_une_entree_openai_renommee_envoie_store_false(): void
    {
        $this->declarer('mon-openai', 'openai');
        $this->declarer('openai-bavard', 'openai', ['store' => true]);

        $this->assertFalse($this->jouer('mon-openai', 'mon-openai.test')['store']);
        $this->assertFalse($this->jouer('openai-bavard', 'openai-bavard.test')['store']);
    }

    /** Le réglage reste dans le double du maillon, que le SDK lit pour savoir qu'il n'a pas d'état côté serveur. */
    public function test_le_double_garde_store_false(): void
    {
        config(['ai.providers.openai.key' => 'k']);

        $this->jouer('openai', 'api.openai.com');

        $this->assertFalse(config('ai.providers.openai'.AiGateway::TOOL_OUTPUT_SUFFIX.'.store'));
    }

    /** Ces options sont propres à leur pilote : aucune ne part ailleurs. */
    public function test_les_autres_pilotes_ne_recoivent_ni_store_ni_provider(): void
    {
        $this->declarer('mon-point', 'openai-compatible');
        $this->declarer('mon-claude', 'anthropic');
        config(['ai.providers.mon-point.provider' => ['data_collection' => 'allow']]);

        foreach ([['mon-point', 'mon-point.test'], ['mon-claude', 'mon-claude.test']] as [$entree, $hote]) {
            $corps = $this->jouer($entree, $hote);
            $this->assertArrayNotHasKey('store', $corps, $entree);
            $this->assertArrayNotHasKey('provider', $corps, $entree);
        }
    }

    /** @return array<string, array{string, string}> */
    public static function pilotes(): array
    {
        return [
            'openai' => ['openai', 'prive-openai.test'],
            'openrouter' => ['openrouter', 'prive-openrouter.test'],
            'openai-compatible' => ['openai-compatible', 'prive-compatible.test'],
        ];
    }

    /** Le masquage ne dépend pas du fournisseur : aucun numéro en clair dans le corps, sur aucun pilote. */
    #[DataProvider('pilotes')]
    public function test_aucun_numero_en_clair_ne_part(string $pilote, string $hote): void
    {
        $entree = substr($hote, 0, -5);
        $this->declarer($entree, $pilote);

        $corps = json_encode($this->jouer($entree, $hote, 'Appelez le +221 77 012 34 56 pour visiter.'), JSON_UNESCAPED_UNICODE);

        $this->assertStringContainsString('pour visiter', $corps);
        $this->assertStringNotContainsString('012 34 56', $corps);
        $this->assertStringNotContainsString('770123456', $corps);
    }

    /**
     * TCK-2449 l'avait mesuré à la main : hors d'Anthropic, le schéma part tel que l'agent le déclare. Racine
     * `object`, tout `required`, `additionalProperties` faux, à toute profondeur : c'est la forme qu'exige le mode
     * strict d'OpenAI, et celle qui laisse le moins de latitude à un modèle qui ne fait que suivre le schéma.
     */
    #[DataProvider('pilotesEtAgents')]
    public function test_les_schemas_envoyes_gardent_leur_forme(string $agent, string $pilote): void
    {
        $schema = AgentSchemas::asSentBy($agent, $pilote);

        $this->assertSame('object', $schema['type'], $agent);
        $this->assertFormeFermee($schema, "{$agent} sur {$pilote}");
    }

    /** @return array<string, array{class-string, string}> */
    public static function pilotesEtAgents(): array
    {
        $cas = [];
        foreach (AgentSchemas::structuredAgents() as $agent) {
            foreach (['openai', 'openrouter', 'openai-compatible'] as $pilote) {
                $cas[class_basename($agent)." {$pilote}"] = [$agent, $pilote];
            }
        }

        return $cas;
    }

    /** @param array<mixed> $noeud */
    private function assertFormeFermee(array $noeud, string $chemin): void
    {
        if (is_array($noeud['properties'] ?? null) && ! array_is_list($noeud['properties'])) {
            $this->assertFalse($noeud['additionalProperties'] ?? null, "{$chemin} : additionalProperties");
            $this->assertEqualsCanonicalizing(array_keys($noeud['properties']), $noeud['required'] ?? [], "{$chemin} : required");
        }
        foreach ($noeud as $cle => $enfant) {
            if (is_array($enfant) && $cle !== 'enum' && $cle !== 'required') {
                $this->assertFormeFermee($enfant, "{$chemin}.{$cle}");
            }
        }
    }

    /** Le schéma mesuré est bien celui qui part, sur l'agent le plus gros : la garde ne porte pas sur autre chose. */
    public function test_la_forme_mesuree_est_celle_du_fil(): void
    {
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);
        $this->declarer('mesure', 'openai');

        app(AiGateway::class)->run(new AiRequest(RadarExtractionUsage::KEY, 'Une annonce.', [AiDataClass::Personnelle], link: new ModelLink('mesure', 'modele-a', 100), evaluation: true));

        $this->assertEquals(
            AgentSchemas::asSentBy((new RadarExtractionUsage)->agentClass(), 'openai'),
            $this->corps['mesure.test'][0]['text']['format']['schema'],
        );
    }
}
