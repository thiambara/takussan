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

    /**
     * TCK-2403 (AC2) — au moins la moitié du jeu vient d'annonces RÉELLES, et `provenance.json` le dit cas
     * par cas : un cas réel est une annonce de texte (jamais une capture : aucune capture réelle ne
     * s'anonymise), prise sur l'un des deux sites relevés, avec la date du relevé et jamais son URL.
     */
    public function test_at_least_half_of_the_set_comes_from_real_listings_and_says_so(): void
    {
        $provenance = json_decode((string) file_get_contents($this->dir().'/provenance.json'), true, flags: JSON_THROW_ON_ERROR);
        $files = array_map(fn (string $path): string => basename($path, '.json'), glob($this->dir().'/cases/*.json'));
        sort($files);
        $keys = array_keys($provenance);
        sort($keys);
        $this->assertSame($files, $keys, 'provenance.json décrit exactement les cas du jeu');

        $cases = $this->runner->cases(RadarExtractionUsage::KEY);
        $real = 0;
        foreach ($files as $i => $id) {
            $origin = $provenance[$id]['origin'] ?? null;
            $this->assertContains($origin, ['real', 'synthetic'], "cas {$id} : origin");
            if ($origin !== 'real') {
                $this->assertSame(['origin', 'forme'], array_keys($provenance[$id]), "cas {$id} : un cas synthétique ne porte que sa forme, aucune autre clé (une URL, une référence)");

                continue;
            }
            $real++;
            $this->assertContains($provenance[$id]['site'] ?? null, ['expat-dakar', 'coinafrique'], "cas {$id} : site");
            $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}$/', $provenance[$id]['releve'] ?? '', "cas {$id} : date du relevé");
            $this->assertSame(['origin', 'site', 'releve'], array_keys($provenance[$id]), "cas {$id} : ni URL ni autre trace de l'annonce");
            $this->assertEmpty($cases[$i]['attachments'] ?? [], "cas {$id} : un cas réel est un texte");
            $this->assertMatchesRegularExpression('/source="'.($provenance[$id]['site'] === 'expat-dakar' ? 'expat_dakar' : 'coinafrique').'"/', $cases[$i]['input'], "cas {$id} : la source est le site relevé");
        }
        $this->assertGreaterThanOrEqual(count($files) / 2, $real, 'au moins la moitié des cas sont réels');
    }

    /**
     * Ce qu'une donnée personnelle ou une trace de l'annonce d'origine ressemble, dans un texte du dépôt. `PhoneMasker` et
     * `check-ai-evals-pii.mjs` ne voient pas un numéro étranger (leur lookbehind refuse des chiffres qui suivent un indicatif
     * non sénégalais) : cette garde-ci les couvre, à titre de filet, jusqu'à ce que TCK-2410 les corrige. Elle ne reconnaît
     * PAS un nom : la relecture humaine reste seule à les garder.
     *
     * `+33…` (un indicatif suivi d'une ellipse, sans chiffre derrière) est la seule façon de nommer un indicatif dans un document.
     * Le préfixe fictif `+221 74…` des jeux (hors du plan de numérotage) est toléré ; tout autre `+221` suivi de chiffres est signalé.
     *
     * @return list<string> ce qui a été trouvé, une entrée par motif
     */
    private function traces(string $text): array
    {
        $found = [];
        $text = preg_replace('/[\x{200B}\x{200C}\x{200D}\x{2060}\x{FEFF}\x{00AD}]/u', '', $text) ?? $text;
        $sep = '[\s\x{00A0}\x{202F}.\/\-]';
        $space = '[\s\x{00A0}\x{202F}]';
        $money = '(?:'.$space.'*(?:f'.$space.'?cfa|cfa|xof|francs?|frs|f)(?!\p{L}))';
        $checks = [
            'un indicatif étranger (un « + » ou « 00 », même suivi d\'une espace, puis un indicatif et un chiffre)' => '/(?<![\d.])(?:\+|00)\s*(?!221'.$sep.'?74\b)\d{2,3}+'.$sep.'*\d/u',
            'un numéro national à 10 chiffres (06.12.34.56.78)' => '/(?<!\d)0\d(?:'.$sep.'?\d{2}){4}(?!\d)/u',
            'des chiffres espacés un par un (9 ou plus)' => '/(?<!\d)(?:\d'.$sep.'){8,}\d(?!\d)/u',
            'un nombre collé de 9 chiffres ou plus' => '/(?<!\d)\d{9,}(?!\d)/u',
            'un nombre collé de 7 ou 8 chiffres qui n\'est pas un prix' => '/(?<!\d)\d{7,8}(?!\d)(?!'.$money.')/iu',
            'une référence d\'annonce, avec ou sans libellé' => '/(?:r[ée]f(?:[ée]rence)?(?:\s+de\s+l[\'’]annonce)?\s*[:_.\-]?\s*(?:n[°o]\s*)?[a-z]{0,3}[_\-]?\d{3,})/iu',
            'un lien, ou un nom de domaine suivi d\'un chemin' => '#https?://[^\s)`]+/[^\s)`]+|www\.[^\s)`]+/[^\s)`]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|sn|net|org|fr|info|io|co)/[^\s)`]+|https?://(?!(?:www\.expat-dakar\.com|sn\.coinafrique\.com)[\s)`/]*(?:$|[\s)`]))#iu',
            'une arobase' => '/[@\x{FF20}]/u',
        ];
        foreach ($checks as $label => $pattern) {
            if (preg_match($pattern, $text) === 1) {
                $found[] = $label;
            }
        }

        // Un numéro groupé par blocs de 2 ou 3 chiffres : un prix (« 880 000 », « 145 000 000 », blocs de 3 suivis d'une marque monétaire) n'en est pas un.
        if (preg_match_all('/(?<!\d)\d{2,3}(?:'.$sep.'\d{2,3}){2,}(?!\d)/u', $text, $groups, PREG_OFFSET_CAPTURE) > 0) {
            foreach ($groups[0] as [$group, $offset]) {
                $priceShape = preg_match('/^\d{1,3}(?:[\s\x{00A0}\x{202F}.]\d{3})+$/u', $group) === 1;
                $followedByMoney = preg_match('/^'.$money.'/iu', substr($text, $offset + strlen($group))) === 1;
                if (! ($priceShape && $followedByMoney)) {
                    $found[] = 'un numéro groupé par blocs de 2 ou 3 chiffres, qui n\'est pas un prix';
                    break;
                }
            }
        }

        return $found;
    }

    /**
     * Les traces d'un fichier : son texte brut ET, pour un JSON, chaque chaîne décodée (clés comprises) — `json_encode`
     * sans `JSON_UNESCAPED_UNICODE` écrit une espace insécable «   », qu'aucun motif ne voit dans le texte brut.
     *
     * @return list<string>
     */
    private function tracesOfFile(string $content, bool $json): array
    {
        $found = $this->traces($content);
        if ($json) {
            $strings = [];
            $walk = function (mixed $node) use (&$walk, &$strings): void {
                if (is_string($node)) {
                    $strings[] = $node;
                } elseif (is_array($node)) {
                    foreach ($node as $key => $value) {
                        is_string($key) && $strings[] = $key;
                        $walk($value);
                    }
                }
            };
            $walk(json_decode($content, true));
            foreach ($strings as $string) {
                $found = [...$found, ...$this->traces($string)];
            }
        }

        return array_values(array_unique($found));
    }

    /**
     * TCK-2403 (AC2) — AUCUN fichier du jeu (cas, attendus, README, provenance, relecture) ni le ticket ne porte une
     * donnée personnelle ou une trace de l'annonce d'origine : numéro (étranger compris, avec ou sans espace après le « + »,
     * en forme nationale, groupé ou collé), référence, lien, arobase. Un exemple dans un document est une fuite comme une
     * autre : ce sont deux vrais numéros cités « pour illustrer » qui ont été publiés (README et ticket).
     */
    public function test_nothing_in_the_set_keeps_a_trace_of_an_original_listing(): void
    {
        $files = array_values(array_filter(
            glob($this->dir().'/{*,cases/*}', GLOB_BRACE) ?: [],
            fn (string $path): bool => is_file($path) && ! str_ends_with($path, '.png') && basename($path) !== 'baseline.json',
        ));
        $ticket = glob(base_path('../docs/backlog/tickets/TCK-2403-*.md')) ?: [];
        $this->assertNotEmpty($ticket, 'le ticket est lu par la garde : un document ne cite aucune donnée relevée');
        $files = array_values(array_unique([...$files, ...$ticket]));
        $this->assertGreaterThan(30, count($files), 'la garde lit les cas et les documents du jeu');

        foreach ($files as $path) {
            $this->assertSame([], $this->tracesOfFile((string) file_get_contents($path), str_ends_with($path, '.json')), basename($path));
        }
    }

    /** La garde reconnaît les formes qui ont échappé aux premières (une espace après le « + », la forme nationale, un `expected`…). */
    public function test_the_trace_guard_catches_the_forms_that_slipped_through(): void
    {
        $catches = [
            '+ 33 6 12 34 56 78', '+33 6 12 34 56 78', '+33'.'612345678', '+225'.'0712345678', '0033612345678', '06.12.34.56.78', '06 12 34 56 78',
            '77 123 45 67', '77'.'1234567', '+221 77 123 45 67', '+221771234567', 'Réf. 1234567', 'Ref_0000_AB', 'Référence de l\'annonce : 1234567', '1234567', 'contact@exemple.sn',
            'https://www.expat-dakar.com/annonce/appartement-1234567', 'www.coinafrique.com/annonce/x',
            // les formes qui avaient échappé à la seconde passe
            'expat-dakar.com/annonce/un-titre-quelconque', 'sn.coinafrique.com/annonce/x', '+33/6/12/34/56/78', '06/12/34/56/78', '0 6 1 2 3 4 5 6 7 8', '+3 3 6 1 2 3 4 5 6 7 8',
            '612345678 F', '612345678F CFA', '77 123 45 67 F',
        ];
        foreach ($catches as $text) {
            $this->assertNotSame([], $this->traces($text), "devrait être signalé : {$text}");
        }
        // Un JSON dont l'espace insécable est ÉCHAPPÉE : invisible dans le texte brut, vue une fois décodée.
        $escaped = json_encode(['expected' => ['price' => "+33\u{00A0}6\u{00A0}12\u{00A0}34\u{00A0}56\u{00A0}78"]]);
        $this->assertStringContainsString('\u00a0', $escaped, 'json_encode écrit l\'espace insécable en échappement');
        $this->assertSame([], $this->tracesOfFile($escaped, false), 'le texte brut ne voit rien (c\'est le défaut que le décodage corrige)');
        $this->assertNotSame([], $this->tracesOfFile($escaped, true), 'le JSON décodé est lu');
        $this->assertNotSame([], $this->tracesOfFile('{"2": "x", "a": ["06 12 34 56 78"]}', true));
        $this->assertNotSame([], $this->tracesOfFile('{"06 12 34 56 78": "x"}', true), 'une clé aussi');

        $clean = [
            'un indicatif étranger collé à son numéro (`+33…`, `+225…`)', 'Les numéros fictifs du jeu (`+221 74…`) sont hors du plan', '640 000 F Cfa', '230 000 000 CFA', '2 300 000 FCFA par mois', '2300000 frs',
            'bâtiment R+4, 8 chambres', 'maison R+2', '[REFERENCE]', '[TELEPHONE]', 'Superficie 3,100 m²', 'https://www.expat-dakar.com',
            '[Expat-Dakar](https://www.expat-dakar.com) et [CoinAfrique](https://sn.coinafrique.com)', 'Inscrit depuis 9 mois', "Référence de l'annonce : [REFERENCE]",
            '2026-10-29', 'gardiennage 24/24', 'scripts/check-ai-evals-pii.mjs', 'takussan-api/resources/ai/evals/radar.extraction/cases/001.json',
        ];
        foreach ($clean as $text) {
            $this->assertSame([], $this->traces($text), "ne devrait PAS être signalé : {$text}");
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
