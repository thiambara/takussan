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
use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\Ai\UsageDEssai;
use Tests\TestCase;

/**
 * TCK-2450 (ADR-0085 §3) — ni le corps ni la clé ne suivent une redirection. Sans réseau : `Http::fake` répond tout en bas
 * de la pile de Guzzle, sous son suivi des redirections. Sans le correctif, le faux fournisseur reçoit donc le second envoi.
 */
class AiProviderRedirectionTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private const AILLEURS = 'ailleurs.test';

    /** @var list<array{host: string, body: string, key: string}> */
    private array $envois = [];

    private int $statut = 307;

    private string $redirigeant = '';

    private ?string $cible = self::AILLEURS;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        config([
            'ai.providers.secours' => ['driver' => 'openrouter', 'key' => 'k', 'url' => 'https://secours.test/v1', 'allowed_hosts' => ['secours.test']],
            'ai.pricing.secours' => ['modele-a' => ['input' => '1', 'output' => '1', 'cache_read' => '1', 'cache_write' => '1']],
        ]);
        Http::preventStrayRequests();
        Http::fake($this->repondre(...));
    }

    private function brancher(int $statut, string $redirigeant, ?string $cible = self::AILLEURS): void
    {
        $this->statut = $statut;
        $this->redirigeant = $redirigeant;
        $this->cible = $cible;
    }

    private function repondre(Request $requete): PromiseInterface
    {
        $hote = (string) parse_url($requete->url(), PHP_URL_HOST);
        $this->envois[] = ['host' => $hote, 'body' => $requete->body(), 'key' => $requete->header('Authorization')[0] ?? $requete->header('x-api-key')[0] ?? ''];

        return $hote === $this->redirigeant
            ? Http::response('', $this->statut, $this->cible === null ? [] : ['Location' => 'https://'.$this->cible.'/autre'.parse_url($requete->url(), PHP_URL_PATH)])
            : Http::response($this->reponse($requete->url()));
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
            foreach ([300, 301, 302, 303, 307, 308, 399] as $statut) {
                $cas["{$pilote} {$statut}"] = [$pilote, $statut];
            }
        }

        return $cas;
    }

    /** @return array<string, array{int}> */
    public static function statuts(): array
    {
        return ['300' => [300], '301' => [301], '302' => [302], '303' => [303], '307' => [307], '308' => [308], '399' => [399]];
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

    /** Un 3xx sans `Location` : Guzzle ne le suit pas, et le SDK lèverait sur son corps vide une erreur qui arrêterait la chaîne. */
    #[DataProvider('pilotesEtStatuts')]
    public function test_un_3xx_sans_location_bascule_comme_une_redirection(string $pilote, int $statut): void
    {
        $entree = $this->declarer($pilote);
        $this->chaine([$entree, 'secours']);
        $this->brancher($statut, "{$entree}.test", null);

        $this->jouer();

        $this->assertSame(["{$entree}.test", 'secours.test'], array_column($this->envois, 'host'));
        $lignes = AiCall::query()->orderBy('id')->get();
        $this->assertSame([AiCallOutcome::FailedOver, 'ai.provider_redirected'], [$lignes[0]->outcome, $lignes[0]->error_code]);
    }

    public function test_un_3xx_sans_location_sur_un_embedding_bascule_de_meme(): void
    {
        $this->declarerVoyage();
        config(['ai.providers.vecteurs-secours' => ['url' => 'https://vecteurs-secours.test/v1', 'allowed_hosts' => ['vecteurs-secours.test']] + config('ai.providers.voyageai')]);
        config(['ai.roles.embedding' => [['provider' => 'voyageai', 'model' => 'modele-a', 'max_tokens' => 1], ['provider' => 'vecteurs-secours', 'model' => 'modele-a', 'max_tokens' => 1]]]);
        $this->brancher(307, 'api.voyageai.com', null);

        $this->assertSame('vecteurs-secours', app(AiGateway::class)->embed(new AiRequest(RadarEmbeddingUsage::KEY, 'CONTENU'), ['CONTENU'], 2)->link->provider);
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

    public function test_le_middleware_du_client_http_est_rendu_apres_l_appel(): void
    {
        $lire = fn (): array => (fn () => $this->globalMiddleware)->call(Http::getFacadeRoot());

        $this->chaine(['secours']);
        $this->brancher(307, 'personne.test');
        $this->jouer();
        $this->assertSame([], $lire(), 'après un succès');

        $this->chaine([$this->declarer('openai'), 'secours']);
        $this->brancher(307, 'point-openai.test');
        $this->jouer();
        $this->assertSame([], $lire(), 'après une redirection');
    }

    /** Hors de l'appel, le client HTTP de l'application suit ses redirections comme avant. */
    public function test_le_reste_de_l_application_suit_encore_ses_redirections(): void
    {
        $this->chaine(['secours']);
        $this->brancher(307, 'personne.test');
        $this->jouer();

        $this->brancher(307, 'site.test');
        Http::post('https://site.test/v1', ['a' => 1]);

        $this->assertSame(['site.test', self::AILLEURS], array_slice(array_column($this->envois, 'host'), -2));
    }
}
