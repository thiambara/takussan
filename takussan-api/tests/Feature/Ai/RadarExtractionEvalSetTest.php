<?php

namespace Tests\Feature\Ai;

use App\Ai\Agents\RadarExtraction;
use App\Ai\Usages\RadarExtractionUsage;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarSourceSite;
use App\Models\Enums\RentPeriod;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\Evaluation\FieldScorer;
use App\Services\Ai\ExternalContent;
use App\Services\Ai\ModelResolver;
use App\Services\Ai\PromptRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\TestCase;

/**
 * TCK-2386 (ADR-0076 §8) — le jeu d'évaluation livré de `radar.extraction` : 30 cas, dont 6 à
 * captures, chacun dans la forme exacte de ce que le job envoie (`ExternalContent::wrap()` du texte
 * rogné, bloc vide pour des captures), et des attendus qui ne nomment que des champs du schéma, notés
 * sur leur seule valeur (`path` de `fields.json`). Aucun modèle réel : `RadarExtraction::fake()`.
 */
class RadarExtractionEvalSetTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private const CAPTURE_MAX_BYTES = 100 * 1024;

    private EvaluationRunner $runner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        config([
            'ai.roles.vision' => [['provider' => 'anthropic', 'model' => 'modele-v', 'max_tokens' => 2000]],
            'ai.pricing.anthropic.modele-v' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75],
        ]);
        // Le catalogue, les prompts et le jeu RÉELS : c'est ce qui est livré qu'on éprouve.
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);
        $this->runner = new EvaluationRunner(app(AiGateway::class), app(AiUsageRegistry::class), app(ModelResolver::class), new FieldScorer);
    }

    private function dir(): string
    {
        return base_path('resources/ai/evals/'.RadarExtractionUsage::KEY);
    }

    /** @return array<string, array{type: string, path: string, tolerance?: float}> */
    private function fields(): array
    {
        return json_decode((string) file_get_contents($this->dir().'/fields.json'), true, flags: JSON_THROW_ON_ERROR);
    }

    public function test_the_set_has_thirty_cases_six_of_them_with_captures(): void
    {
        $cases = $this->runner->cases(RadarExtractionUsage::KEY);

        $this->assertCount(30, $cases);
        $this->assertCount(6, array_filter($cases, fn (array $case): bool => ! empty($case['attachments'])));
        foreach ($cases as $i => $case) {
            $this->assertIsString($case['input'] ?? null, "cas {$i} : input");
            $this->assertNotSame('', $case['input']);
            $this->assertIsArray($case['expected'] ?? null, "cas {$i} : expected");
            $this->assertNotSame([], $case['expected']);
        }
    }

    public function test_each_attachment_is_a_small_png_under_the_usage_folder(): void
    {
        foreach ($this->runner->cases(RadarExtractionUsage::KEY) as $case) {
            foreach ($case['attachments'] ?? [] as $relative) {
                $this->assertMatchesRegularExpression('#^captures/[a-z0-9_-]+\.png$#', $relative);
                $path = $this->dir().'/'.$relative;
                $this->assertFileExists($path);
                $this->assertSame("\x89PNG\r\n\x1a\n", (string) file_get_contents($path, length: 8), "{$relative} n'est pas un PNG");
                $this->assertLessThan(self::CAPTURE_MAX_BYTES, filesize($path), "{$relative} est trop lourde");
                $this->assertSame(IMAGETYPE_PNG, getimagesize($path)[2] ?? null);
            }
        }
    }

    /** L'entrée d'un cas est exactement celle du job : le texte rogné délimité par sa source, vide pour des captures. */
    public function test_each_input_is_what_the_job_sends(): void
    {
        foreach ($this->runner->cases(RadarExtractionUsage::KEY) as $i => $case) {
            $this->assertSame(1, preg_match('#<('.ExternalContent::TAG_PREFIX.'[a-p]{16}) source="([^"]*)">\n(.*)\n</\1>$#s', $case['input'], $m), "cas {$i} : bloc absent");
            [, , $source, $content] = $m;
            $this->assertNotNull(RadarSourceSite::tryFrom($source), "cas {$i} : source inconnue « {$source} »");
            $this->assertSame(ExternalContent::wrap($source, $content), $case['input'], "cas {$i} : pas la forme de ExternalContent::wrap()");
            $this->assertSame(trim($content), $content, "cas {$i} : le job rogne le texte");
            $this->assertSame(! empty($case['attachments']), $content === '', "cas {$i} : un bloc vide va avec des captures, et elles seules");
        }
    }

    public function test_every_expected_value_is_a_known_field_of_the_schema_with_a_legal_value(): void
    {
        $fields = $this->fields();
        $schema = [...RadarExtraction::PROPERTY_FIELDS, ...RadarExtraction::ADVERTISER_FIELDS];
        foreach ($fields as $key => $spec) {
            $this->assertSame($key.'.value', $spec['path'] ?? null, "fields.json : {$key} doit lire la valeur");
            $this->assertContains($key, $schema);
            $this->assertContains($spec['type'] ?? null, ['exact', 'text', 'number', 'list']);
        }
        $this->assertNotContains('title', array_keys($fields));
        $this->assertNotContains('description', array_keys($fields));

        foreach ($this->runner->cases(RadarExtractionUsage::KEY) as $i => $case) {
            $expected = $case['expected'];
            $this->assertSame(array_keys($fields), array_keys($expected), "cas {$i} : les attendus sont les champs de fields.json");
            $this->assertNotNull(PropertyType::tryFrom((string) $expected['property_type']), "cas {$i} : property_type");
            $this->assertContains($expected['contract'], RadarExtraction::CONTRACTS, "cas {$i} : contract");
            $this->assertNotNull(RadarAdvertiserNature::tryFrom((string) $expected['advertiser_nature']), "cas {$i} : advertiser_nature");
            $this->assertTrue($expected['rent_period'] === null || RentPeriod::tryFrom($expected['rent_period']) !== null, "cas {$i} : rent_period");
            $this->assertTrue($expected['contract'] === 'rent' || $expected['rent_period'] === null, "cas {$i} : une vente n'a pas de période");
            foreach (['bedrooms', 'bathrooms'] as $entier) {
                $this->assertTrue($expected[$entier] === null || is_int($expected[$entier]), "cas {$i} : {$entier}");
            }
            $this->assertTrue($expected['furnished'] === null || is_bool($expected['furnished']), "cas {$i} : furnished");
            $this->assertTrue($expected['amenities'] === null || (array_is_list($expected['amenities']) && $expected['amenities'] !== []), "cas {$i} : amenities nul ou non vide");
            foreach (['price', 'neighborhood', 'city'] as $texte) {
                $this->assertTrue($expected[$texte] === null || is_string($expected[$texte]), "cas {$i} : {$texte}");
            }
        }
    }

    /**
     * Le jeu se joue de bout en bout sur faux modèle : une sortie qui rend chaque attendu dans la forme
     * du schéma (`{value, confidence, evidence}`) vaut 1.0 partout — la projection `path` lit la
     * valeur, pas l'objet —, et un champ faux ne baisse que son propre score.
     */
    public function test_a_dry_run_on_outputs_equal_to_the_expectations_scores_one(): void
    {
        $cases = $this->runner->cases(RadarExtractionUsage::KEY);
        RadarExtraction::fake(array_map(fn (array $case): array => $this->sortie($case['expected']), $cases));

        $report = $this->runner->run(RadarExtractionUsage::KEY);

        $this->assertSame(30, $report['cases']);
        $this->assertSame(0, $report['failures']);
        $this->assertSame(1.0, $report['global']);
        $attendus = array_fill_keys(array_keys($this->fields()), 1.0);
        ksort($attendus);
        $this->assertSame($attendus, array_map(fn ($s) => (float) $s, $report['fields']));
        $this->assertSame(24, $report['roles']['extraction']['cases']);
        $this->assertSame(6, $report['roles']['vision']['cases']);

        $wrong = $cases;
        $wrong[0]['expected']['bedrooms'] = 9;
        RadarExtraction::fake(array_map(fn (array $case): array => $this->sortie($case['expected']), $wrong));

        $report = $this->runner->run(RadarExtractionUsage::KEY);

        $this->assertSame(round(29 / 30, 4), $report['fields']['bedrooms']);
        $this->assertSame(1.0, (float) $report['fields']['price']);
    }

    /**
     * Une sortie complète du schéma dont les valeurs sont les attendus.
     *
     * @param  array<string, mixed>  $expected
     * @return array<string, mixed>
     */
    private function sortie(array $expected): array
    {
        $out = [];
        foreach ([...RadarExtraction::PROPERTY_FIELDS, ...RadarExtraction::ADVERTISER_FIELDS] as $field) {
            $value = $expected[$field] ?? null;
            $out[$field] = ['value' => $value, 'confidence' => $value === null ? 'low' : 'high', 'evidence' => $value === null ? null : 'passage'];
        }

        return $out + ['phones' => [], 'nature_signals' => []];
    }
}
