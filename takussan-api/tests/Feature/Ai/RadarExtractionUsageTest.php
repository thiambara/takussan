<?php

namespace Tests\Feature\Ai;

use App\Ai\Agents\RadarExtraction;
use App\Ai\Usages\RadarExtractionUsage;
use App\Models\AiCall;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiDataClass;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\AiRefusalReason;
use App\Models\Enums\PlatformAbility;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarConfidence;
use App\Models\Enums\RentPeriod;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\AttachmentsUseVision;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\ExternalContent;
use App\Services\Ai\ExternalContentPolicy;
use App\Services\Ai\PromptRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\JsonSchema\JsonSchemaTypeFactory;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Laravel\Ai\Contracts\HasSkills;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\Files\Image;
use Laravel\Ai\ObjectSchema;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2386 (ADR-0077, sur le socle d'ADR-0076) — l'usage `radar.extraction` : au registre, sans
 * outil, à sortie structurée, classe `personnelle` (les numéros arrivent au modèle, l'extraction
 * doit les lire), réservé au niveau `support`, et servi par le rôle `vision` quand une capture est
 * jointe. Aucun appel réseau : `RadarExtraction::fake()`.
 */
class RadarExtractionUsageTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;
    use SocleIaDEssai;

    private string $dossier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        config([
            'ai.roles.vision' => [['provider' => 'anthropic', 'model' => 'modele-v', 'max_tokens' => 2000]],
            'ai.pricing.anthropic.modele-v' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75],
        ]);
        // Le catalogue et les prompts RÉELS : c'est l'usage livré qu'on éprouve.
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);
        $this->dossier = storage_path('framework/testing/radar-extraction-'.Str::random(8));
        File::ensureDirectoryExists($this->dossier);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->dossier);
        parent::tearDown();
    }

    private function requete(?PlatformProfileLevel $niveau = PlatformProfileLevel::Support, string $texte = 'Appartement F3 à louer à Liberté 6, 450.000f/mois.', array $pieces = []): AiRequest
    {
        return new AiRequest(
            RadarExtractionUsage::KEY,
            ExternalContent::wrap('text', $texte),
            [AiDataClass::Personnelle],
            actor: $niveau !== null ? $this->operateur($niveau) : null,
            attachments: $pieces,
        );
    }

    /** @return array<string, mixed> */
    private function schema(): array
    {
        return (new ObjectSchema((new RadarExtraction)->schema(new JsonSchemaTypeFactory)))->toSchema();
    }

    /** Les valeurs admises d'un nœud, qu'il soit écrit en `type: [x, null]` ou en `anyOf`. */
    private function enumOf(array $node): array
    {
        return $node['enum'] ?? collect($node['anyOf'] ?? [])->pluck('enum')->filter()->first() ?? [];
    }

    private function isNullable(array $node): bool
    {
        return in_array('null', (array) ($node['type'] ?? []), true)
            || collect($node['anyOf'] ?? [])->contains(fn (array $b) => ($b['type'] ?? null) === 'null');
    }

    public function test_the_usage_is_declared_in_the_registry_with_its_contract(): void
    {
        $this->assertContains(RadarExtractionUsage::class, AiUsageRegistry::USAGES);
        $usage = (new AiUsageRegistry)->get('radar.extraction');

        $this->assertInstanceOf(RadarExtractionUsage::class, $usage);
        $this->assertInstanceOf(AttachmentsUseVision::class, $usage);
        $this->assertSame(AiModelRole::Extraction, $usage->role());
        $this->assertSame(RadarExtraction::class, $usage->agentClass());
        $this->assertSame(2, $usage->promptVersion());
        $this->assertSame(AiDataClass::Personnelle, $usage->maxDataClass());
        $this->assertSame(PlatformAbility::RadarOperate, $usage->authority());
        $this->assertSame(2000.0, $usage->dailyBudgetXof());
        $this->assertSame(0, $usage->cacheTtlSeconds());
        $this->assertTrue($usage->readsExternalContent());
    }

    public function test_its_agent_has_no_tool_and_a_structured_output(): void
    {
        $this->assertTrue(is_a(RadarExtraction::class, HasStructuredOutput::class, true));
        $this->assertFalse(is_a(RadarExtraction::class, HasTools::class, true));
        $this->assertFalse(is_a(RadarExtraction::class, HasSkills::class, true));
        $this->assertSame([], ExternalContentPolicy::violations((new AiUsageRegistry)->all()));
    }

    public function test_the_operate_ability_starts_at_the_support_level(): void
    {
        $this->assertFalse(PlatformAbility::RadarOperate->grantedTo(PlatformProfileLevel::Viewer));
        $this->assertTrue(PlatformAbility::RadarOperate->grantedTo(PlatformProfileLevel::Support));
        $this->assertTrue(PlatformAbility::RadarOperate->grantedTo(PlatformProfileLevel::SuperAdmin));
    }

    public function test_every_property_field_is_a_value_a_confidence_and_a_quoted_evidence(): void
    {
        $proprietes = $this->schema()['properties'];

        $this->assertSame(
            [...RadarExtraction::PROPERTY_FIELDS, 'phones', 'advertiser_name', 'advertiser_nature', 'nature_signals'],
            array_keys($proprietes),
        );
        foreach ([...RadarExtraction::PROPERTY_FIELDS, 'advertiser_name', 'advertiser_nature'] as $champ) {
            $noeud = $proprietes[$champ];
            $this->assertSame(['value', 'confidence', 'evidence'], array_keys($noeud['properties']), $champ);
            $this->assertSame(['value', 'confidence', 'evidence'], $noeud['required'], $champ);
            $this->assertSame(array_column(RadarConfidence::cases(), 'value'), $this->enumOf($noeud['properties']['confidence']), $champ);
            // Revue M2 — la nature inconnue s'écrit `unknown`, jamais null : une seule forme.
            $this->assertSame($champ !== 'advertiser_nature', $this->isNullable($noeud['properties']['value']), "{$champ}.value : null admis seulement hors nature");
            // TCK-2411 — jamais null : la chaîne vide dit « aucun passage ». Nullable, chaque champ ajoutait une union
            // de plus, et Anthropic en refuse plus de 16 (`AgentSchemasStayUnderTheUnionLimitTest`).
            $this->assertFalse($this->isNullable($noeud['properties']['evidence']), "{$champ}.evidence ne doit pas admettre null");
            $this->assertSame('string', $noeud['properties']['evidence']['type'], $champ);
        }
    }

    public function test_the_closed_fields_are_json_schema_enums_and_the_price_stays_text(): void
    {
        $p = $this->schema()['properties'];

        $this->assertSame(array_column(PropertyType::cases(), 'value'), $this->enumOf($p['property_type']['properties']['value']));
        $this->assertSame(['rent', 'sale'], $this->enumOf($p['contract']['properties']['value']));
        $this->assertSame(array_column(RentPeriod::cases(), 'value'), $this->enumOf($p['rent_period']['properties']['value']));
        $this->assertSame(array_column(RadarAdvertiserNature::cases(), 'value'), $this->enumOf($p['advertiser_nature']['properties']['value']));
        $this->assertSame(['string', 'null'], $p['price']['properties']['value']['type']);
        $this->assertSame(['integer', 'null'], $p['bedrooms']['properties']['value']['type']);
        $this->assertSame(['number', 'null'], $p['surface_m2']['properties']['value']['type']);
        $this->assertSame(['boolean', 'null'], $p['furnished']['properties']['value']['type']);
        $this->assertSame('string', $p['amenities']['properties']['value']['items']['type']);
        $this->assertSame('string', $p['phones']['items']['type']);
        $this->assertSame(['signal', 'evidence'], array_keys($p['nature_signals']['items']['properties']));
    }

    public function test_a_phone_number_reaches_the_agent_unmasked_for_a_support_operator(): void
    {
        $recu = null;
        RadarExtraction::fake(function (string $prompt) use (&$recu) {
            $recu = $prompt;

            return ['phones' => ['77 123 45 67']];
        });

        $resultat = app(AiGateway::class)->run($this->requete(texte: 'Villa à louer aux Almadies, appelez le 77 123 45 67'));

        $this->assertStringContainsString('77 123 45 67', (string) $recu);
        $this->assertStringNotContainsString('[TELEPHONE]', (string) $recu);
        $this->assertSame(['phones' => ['77 123 45 67']], $resultat->structured);
        $this->assertSame(AiModelRole::Extraction, AiCall::query()->sole()->role);
    }

    public function test_a_viewer_is_refused_without_reaching_the_model(): void
    {
        RadarExtraction::fake();

        try {
            app(AiGateway::class)->run($this->requete(PlatformProfileLevel::Viewer));
            $this->fail('un viewer ne doit pas déclencher l\'extraction');
        } catch (AiRefused $refus) {
            $this->assertSame(AiRefusalReason::Forbidden, $refus->reason);
        }
        RadarExtraction::assertNeverPrompted();
    }

    public function test_an_attached_capture_is_read_by_the_vision_role(): void
    {
        File::put($this->dossier.'/capture.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='));
        RadarExtraction::fake([['phones' => []]]);

        app(AiGateway::class)->run($this->requete(texte: '', pieces: [Image::fromPath($this->dossier.'/capture.png')]));

        $appel = AiCall::query()->sole();
        $this->assertSame([AiModelRole::Vision, 'modele-v', AiCallOutcome::Success], [$appel->role, $appel->model, $appel->outcome]);
    }

    public function test_the_schema_is_servable_by_the_sdk_fake_without_a_scripted_answer(): void
    {
        RadarExtraction::fake();

        $structure = app(AiGateway::class)->run($this->requete())->structured;

        $this->assertSame(array_keys($this->schema()['properties']), array_keys($structure));
    }

    public function test_the_prompt_carries_the_quoted_passage_rule_and_the_data_block_reminder(): void
    {
        $prompt = app(PromptRepository::class)->load(RadarExtractionUsage::KEY, (new RadarExtractionUsage)->promptVersion());

        foreach (['mot pour mot', 'null', 'low', 'invente', 'commission', 'frais de visite', 'contenu_externe', 'jamais `null`', 'première offre', '`evidence` vaut la chaîne vide `""`'] as $attendu) {
            $this->assertStringContainsStringIgnoringCase($attendu, $prompt);
        }
        // TCK-2411 — le schéma n'admet plus `evidence: null` : le prompt joué ne doit plus le demander.
        $this->assertStringNotContainsString('`evidence` vaut `null`', $prompt);
        $this->assertStringNotContainsString('`evidence` à `null`', $prompt);
    }
}
