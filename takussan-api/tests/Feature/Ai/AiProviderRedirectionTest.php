<?php

namespace Tests\Feature\Ai;

use App\Ai\Usages\RadarEmbeddingUsage;
use App\Models\AiCall;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiDataClass;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Exceptions\AiUnavailable;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Promise\Create;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\Http\Message\RequestInterface;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/**
 * TCK-2450 (ADR-0085 §3) — ni le corps ni la clé ne suivent une redirection. `Http::fake` répond avant le suivi des
 * redirections de Guzzle et ne prouverait rien : ici, la vraie pile de Guzzle tourne, sur un gestionnaire de fin
 * qui ne joint aucun réseau. Une option `handler` par requête remplace la pile entière du client HTTP.
 */
class AiProviderRedirectionTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private const AILLEURS = 'ailleurs.test';

    /** @var list<array{host: string, body: string, key: string}> */
    private array $envois = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        config([
            'ai.providers.secours' => ['driver' => 'openrouter', 'key' => 'k', 'url' => 'https://secours.test/v1', 'allowed_hosts' => ['secours.test']],
            'ai.pricing.secours' => ['modele-a' => ['input' => '1', 'output' => '1', 'cache_read' => '1', 'cache_write' => '1']],
        ]);
    }

    /** Le gestionnaire de fin tient lieu de réseau : chaque requête qu'il reçoit serait partie. */
    private function brancher(int $statut, string $redirigeant, string $cible = self::AILLEURS): void
    {
        $stack = HandlerStack::create(new MockHandler);
        $stack->setHandler(function (RequestInterface $requete, array $options) use ($statut, $redirigeant, $cible) {
            $hote = $requete->getUri()->getHost();
            $this->envois[] = ['host' => $hote, 'body' => (string) $requete->getBody(), 'key' => $requete->getHeaderLine('Authorization').$requete->getHeaderLine('x-api-key')];

            return Create::promiseFor($hote === $redirigeant
                ? new Response($statut, ['Location' => 'https://'.$cible.'/autre'.$requete->getUri()->getPath()])
                : new Response(200, ['Content-Type' => 'application/json'], (string) json_encode($this->reponse((string) $requete->getUri()))));
        });
        Http::getFacadeRoot()->globalOptions(['handler' => $stack]);
    }

    /** @return array<string, mixed> */
    private function reponse(string $url): array
    {
        return match (true) {
            str_ends_with($url, '/responses') => ['id' => 'r', 'model' => 'm', 'status' => 'completed', 'output' => [['type' => 'message', 'role' => 'assistant', 'content' => [['type' => 'output_text', 'text' => '{"a":1}']]]], 'usage' => ['input_tokens' => 1, 'output_tokens' => 1]],
            str_ends_with($url, '/messages') => ['id' => 'm', 'type' => 'message', 'role' => 'assistant', 'model' => 'm', 'stop_reason' => 'end_turn', 'content' => [['type' => 'text', 'text' => '{"a":1}']], 'usage' => ['input_tokens' => 1, 'output_tokens' => 1]],
            str_ends_with($url, '/embeddings') => ['data' => [['embedding' => [0.5, 0.5], 'index' => 0]], 'usage' => ['total_tokens' => 2]],
            default => ['id' => 'c', 'model' => 'm', 'choices' => [['message' => ['role' => 'assistant', 'content' => '{"a":1}'], 'finish_reason' => 'stop']], 'usage' => ['prompt_tokens' => 1, 'completion_tokens' => 1]],
        };
    }

    private function declarer(string $pilote): string
    {
        $entree = "point-{$pilote}";
        config([
            "ai.providers.{$entree}" => ['driver' => $pilote, 'key' => 'cle-du-point', 'url' => "https://{$entree}.test/v1", 'allowed_hosts' => ["{$entree}.test"]],
            "ai.pricing.{$entree}" => ['modele-a' => ['input' => '1', 'output' => '1', 'cache_read' => '1', 'cache_write' => '1']],
        ]);

        return $entree;
    }

    private function declarerVoyage(): void
    {
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry([RadarEmbeddingUsage::class]));
        config([
            'ai.providers.voyageai.key' => 'cle-du-point',
            'ai.providers.voyageai.training_opt_out' => true,
            'ai.pricing.voyageai' => ['modele-a' => ['input' => '1', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0']],
            'ai.pricing.vecteurs-secours' => ['modele-a' => ['input' => '1', 'output' => '0', 'cache_read' => '0', 'cache_write' => '0']],
        ]);
    }

    /** @param list<string> $entrees */
    private function chaine(array $entrees): void
    {
        config(['ai.roles.extraction' => array_map(fn (string $e): array => ['provider' => $e, 'model' => 'modele-a', 'max_tokens' => 10], $entrees)]);
    }

    private function jouer(): void
    {
        app(AiGateway::class)->run(new AiRequest(UsageDEssai::KEY, 'CONTENU-DE-LA-DEMANDE', [AiDataClass::Publique], evaluation: true));
    }

    /** @return array<string, array{string, int}> */
    public static function pilotesEtStatuts(): array
    {
        $cas = [];
        foreach (['anthropic', 'openai', 'openrouter', 'openai-compatible'] as $pilote) {
            foreach ([301, 302, 303, 307, 308] as $statut) {
                $cas["{$pilote} {$statut}"] = [$pilote, $statut];
            }
        }

        return $cas;
    }

    /** @return array<string, array{int}> */
    public static function statuts(): array
    {
        return ['301' => [301], '302' => [302], '303' => [303], '307' => [307], '308' => [308]];
    }

    #[DataProvider('pilotesEtStatuts')]
    public function test_rien_ne_suit_une_redirection_et_la_chaine_bascule(string $pilote, int $statut): void
    {
        $entree = $this->declarer($pilote);
        $this->chaine([$entree, 'secours']);
        $this->brancher($statut, "{$entree}.test");

        $this->jouer();

        $this->assertSame(["{$entree}.test", 'secours.test'], array_column($this->envois, 'host'), 'un seul envoi au maillon redirigeant, aucun ailleurs');
        $lignes = AiCall::query()->orderBy('id')->get();
        $this->assertSame([AiCallOutcome::FailedOver, AiCallOutcome::Success], [$lignes[0]->outcome, $lignes[1]->outcome]);
        $this->assertSame('ai.provider_redirected', $lignes[0]->error_code);
        $this->assertSame(AiGateway::WARNING_PROVIDER_REJECTED, $lignes[0]->warning);
    }

    /** B1 couvre aussi `embed()` : aucun appel d'embeddings ne suit une redirection, et la chaîne bascule de même. */
    #[DataProvider('statuts')]
    public function test_un_embedding_ne_suit_aucune_redirection_et_la_chaine_bascule(int $statut): void
    {
        $this->declarerVoyage();
        config(['ai.providers.vecteurs-secours' => ['url' => 'https://vecteurs-secours.test/v1', 'allowed_hosts' => ['vecteurs-secours.test']] + config('ai.providers.voyageai')]);
        config(['ai.roles.embedding' => [['provider' => 'voyageai', 'model' => 'modele-a', 'max_tokens' => 1], ['provider' => 'vecteurs-secours', 'model' => 'modele-a', 'max_tokens' => 1]]]);
        $this->brancher($statut, 'api.voyageai.com');

        $resultat = app(AiGateway::class)->embed(new AiRequest(RadarEmbeddingUsage::KEY, 'CONTENU'), ['CONTENU-DE-LA-DEMANDE'], 2);

        $this->assertSame(['api.voyageai.com', 'vecteurs-secours.test'], array_column($this->envois, 'host'), 'un seul envoi au maillon redirigeant, aucun ailleurs');
        $this->assertSame('vecteurs-secours', $resultat->link->provider);
        $ligne = AiCall::query()->orderBy('id')->first();
        $this->assertSame([AiCallOutcome::FailedOver, 'ai.provider_redirected', AiGateway::WARNING_PROVIDER_REJECTED], [$ligne->outcome, $ligne->error_code, $ligne->warning]);
    }

    public function test_un_dernier_maillon_d_embeddings_redirigeant_rend_l_usage_indisponible(): void
    {
        $this->declarerVoyage();
        config(['ai.roles.embedding' => [['provider' => 'voyageai', 'model' => 'modele-a', 'max_tokens' => 1]]]);
        $this->brancher(307, 'api.voyageai.com');

        try {
            app(AiGateway::class)->embed(new AiRequest(RadarEmbeddingUsage::KEY, 'CONTENU'), ['CONTENU-DE-LA-DEMANDE'], 2);
            $this->fail('aucun maillon n\'a répondu');
        } catch (AiUnavailable $e) {
            $this->assertSame('ai.provider_redirected', $e->getPrevious()?->getMessage());
        }
        $this->assertSame(['api.voyageai.com'], array_column($this->envois, 'host'));
    }

    /** Le premier envoi, lui, est bien parti avec son corps et sa clé : c'est le second qui manque. */
    public function test_le_premier_envoi_porte_le_contenu_et_la_cle(): void
    {
        $this->chaine([$this->declarer('openai'), 'secours']);
        $this->brancher(307, 'point-openai.test');

        $this->jouer();

        $this->assertStringContainsString('CONTENU-DE-LA-DEMANDE', $this->envois[0]['body']);
        $this->assertStringContainsString('cle-du-point', $this->envois[0]['key']);
    }

    public function test_le_dernier_maillon_redirigeant_rend_l_usage_indisponible_et_en_porte_la_cause(): void
    {
        $this->chaine([$this->declarer('openrouter')]);
        $this->brancher(307, 'point-openrouter.test');

        try {
            $this->jouer();
            $this->fail('aucun maillon n\'a répondu');
        } catch (AiUnavailable $e) {
            $this->assertSame('ai.providers_unavailable', $e->getMessage());
            $this->assertSame('ai.provider_redirected', $e->getPrevious()?->getMessage());
        }
        $this->assertSame(['point-openrouter.test'], array_column($this->envois, 'host'));
    }

    /** Même vers le même hôte : l'adresse qui répondrait n'est plus celle qu'on a déclarée. */
    public function test_une_redirection_vers_le_meme_hote_ne_part_pas_non_plus(): void
    {
        $this->chaine([$this->declarer('openai'), 'secours']);
        $this->brancher(307, 'point-openai.test', 'point-openai.test');

        $this->jouer();

        $this->assertSame(['point-openai.test', 'secours.test'], array_column($this->envois, 'host'));
    }

    public function test_les_options_du_client_http_sont_rendues_apres_l_appel(): void
    {
        $lire = fn (): mixed => (fn () => $this->globalOptions)->call(Http::getFacadeRoot());

        $this->chaine(['secours']);
        $this->brancher(307, 'personne.test');
        $avant = $lire();
        $this->jouer();
        $this->assertSame($avant, $lire(), 'après un succès');

        $this->chaine([$this->declarer('openai'), 'secours']);
        $this->brancher(307, 'point-openai.test');
        $avant = $lire();
        $this->jouer();
        $this->assertSame($avant, $lire(), 'après une redirection');
        $this->assertArrayNotHasKey('allow_redirects', $lire());
    }
}
