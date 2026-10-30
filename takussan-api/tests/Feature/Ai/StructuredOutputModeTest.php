<?php

namespace Tests\Feature\Ai;

use App\Ai\Usages\RadarConsentVerificationUsage;
use App\Ai\Usages\RadarExtractionUsage;
use App\Models\AiCall;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiDataClass;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\ExternalContent;
use App\Services\Ai\ModelLink;
use App\Services\Ai\PromptRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\TestCase;

/**
 * TCK-2433 — Anthropic refuse la grammaire compilée du schéma strict de `radar.extraction` (« The
 * compiled grammar is too large », HTTP 400, après TCK-2411). L'agent quitte la sortie structurée
 * stricte (`output_config.format`) pour l'outil forcé non strict de laravel/ai : rien à compiler, et
 * `ExtractionNormalizer` valide déjà chaque valeur. Les autres agents restent stricts.
 *
 * Éprouvé au niveau du fil, sans réseau : `Http::fake` reçoit la requête que laravel/ai enverrait.
 */
class StructuredOutputModeTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    /** @var list<array<string, mixed>> les corps envoyés à `messages` */
    private array $envoyes = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);
        Http::preventStrayRequests();
    }

    /** @param  array<string, mixed>  $contenu  un bloc de contenu de la réponse d'Anthropic */
    private function repondre(array $contenu, string $fin): void
    {
        Http::fake(['api.anthropic.com/*' => function (Request $requete) use ($contenu, $fin) {
            $this->envoyes[] = json_decode($requete->body(), true);

            return Http::response([
                'id' => 'msg_essai', 'type' => 'message', 'role' => 'assistant', 'model' => 'modele-a',
                'content' => [$contenu], 'stop_reason' => $fin,
                'usage' => ['input_tokens' => 100, 'output_tokens' => 20],
            ]);
        }]);
    }

    private function lancer(string $usage): mixed
    {
        return app(AiGateway::class)->run(new AiRequest(
            $usage,
            ExternalContent::wrap('text', 'Appartement F3 à louer à Liberté 6.'),
            [AiDataClass::Personnelle],
            link: new ModelLink('anthropic', 'modele-a', 1000),
            evaluation: true,
        ));
    }

    public function test_l_extraction_part_par_l_outil_non_strict_et_sa_reponse_est_relue(): void
    {
        $sortie = ['title' => ['value' => 'Appartement F3', 'confidence' => 'high', 'evidence' => 'Appartement F3']];
        $this->repondre(['type' => 'tool_use', 'id' => 'toolu_essai', 'name' => 'output_structured_data', 'input' => $sortie], 'tool_use');

        $resultat = $this->lancer(RadarExtractionUsage::KEY);

        $this->assertCount(1, $this->envoyes);
        $corps = $this->envoyes[0];
        $this->assertArrayNotHasKey('output_config', $corps, 'aucune grammaire à compiler');
        $this->assertSame(['type' => 'tool', 'name' => 'output_structured_data'], $corps['tool_choice']);
        $this->assertSame(['output_structured_data'], array_column($corps['tools'], 'name'));
        $this->assertArrayNotHasKey('strict', $corps['tools'][0]);
        // Le schéma envoyé reste celui de l'agent, entier.
        $this->assertArrayHasKey('advertiser_nature', $corps['tools'][0]['input_schema']['properties']);

        $this->assertSame($sortie, $resultat->structured);
        $this->assertSame(['anthropic', 'modele-a', AiCallOutcome::Success, 'stop'], [$resultat->call->provider, $resultat->call->model, $resultat->call->outcome, $resultat->call->stop_reason]);
        $this->assertSame(1, AiCall::query()->count());
    }

    public function test_un_agent_strict_garde_la_sortie_structuree_native(): void
    {
        $this->repondre(['type' => 'text', 'text' => '{"classification": "consent"}'], 'end_turn');

        $resultat = $this->lancer(RadarConsentVerificationUsage::KEY);

        $corps = $this->envoyes[0];
        $this->assertSame('json_schema', $corps['output_config']['format']['type']);
        $this->assertArrayNotHasKey('tools', $corps);
        $this->assertSame(['classification' => 'consent'], $resultat->structured);
        $this->assertSame('anthropic', $resultat->call->provider);
    }
}
