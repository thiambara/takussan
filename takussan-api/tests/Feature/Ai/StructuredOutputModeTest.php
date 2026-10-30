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
use App\Services\Ai\Exceptions\AiUnavailable;
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
 * stricte (`output_config.format`) pour l'outil non strict de laravel/ai : rien à compiler, et
 * `ExtractionNormalizer` valide déjà chaque valeur. L'outil n'est jamais forcé (`tool_choice` `auto`) :
 * Sonnet 5.5 et Opus 5.5 refusent `tool` et `any`. Une réponse sans sortie est un échec du maillon.
 * Les autres agents restent stricts.
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
        // Jamais forcé : Sonnet 5.5 et Opus 5.5 refusent `tool` et `any` (HTTP 400, req_011CgXdugoVPAgD4WoamUxvx).
        $this->assertSame(['type' => 'auto'], $corps['tool_choice']);
        $this->assertSame(['output_structured_data'], array_column($corps['tools'], 'name'));
        $this->assertArrayNotHasKey('strict', $corps['tools'][0]);
        // Le schéma envoyé reste celui de l'agent, entier.
        $this->assertArrayHasKey('advertiser_nature', $corps['tools'][0]['input_schema']['properties']);

        $this->assertSame($sortie, $resultat->structured);
        $this->assertSame(['anthropic', 'modele-a', AiCallOutcome::Success, 'stop'], [$resultat->call->provider, $resultat->call->model, $resultat->call->outcome, $resultat->call->stop_reason]);
        $this->assertSame(1, AiCall::query()->count());
    }

    public function test_une_extraction_rendue_en_json_dans_le_texte_est_relue(): void
    {
        $this->repondre(['type' => 'text', 'text' => '{"title": {"value": null, "confidence": "low", "evidence": ""}}'], 'end_turn');

        $resultat = $this->lancer(RadarExtractionUsage::KEY);

        $this->assertSame(['title' => ['value' => null, 'confidence' => 'low', 'evidence' => '']], $resultat->structured);
        $this->assertSame(AiCallOutcome::Success, $resultat->call->outcome);
    }

    public function test_une_reponse_sans_sortie_est_un_echec_du_maillon(): void
    {
        $this->repondre(['type' => 'text', 'text' => 'Voici les informations de l\'annonce.'], 'end_turn');

        try {
            $this->lancer(RadarExtractionUsage::KEY);
            $this->fail('une réponse sans sortie structurée ne doit pas réussir');
        } catch (AiUnavailable $e) {
            $this->assertSame('ai.providers_unavailable', $e->getMessage());
            $this->assertSame('ai.response_invalid', $e->getPrevious()?->getMessage());
        }
        $appel = AiCall::query()->sole();
        $this->assertSame([AiCallOutcome::FailedOver, 'ai.response_invalid', 100], [$appel->outcome, $appel->error_code, $appel->input_tokens]);
    }

    public function test_un_agent_strict_garde_la_sortie_structuree_native(): void
    {
        $this->repondre(['type' => 'text', 'text' => '{"classification": "consent"}'], 'end_turn');

        $resultat = $this->lancer(RadarConsentVerificationUsage::KEY);

        $corps = $this->envoyes[0];
        $this->assertSame('json_schema', $corps['output_config']['format']['type']);
        $this->assertArrayNotHasKey('tools', $corps);
        $this->assertArrayNotHasKey('tool_choice', $corps);
        $this->assertSame(['classification' => 'consent'], $resultat->structured);
        $this->assertSame('anthropic', $resultat->call->provider);
    }
}
