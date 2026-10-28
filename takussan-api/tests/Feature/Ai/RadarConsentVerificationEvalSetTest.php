<?php

namespace Tests\Feature\Ai;

use App\Ai\Agents\RadarConsentVerification;
use App\Ai\Usages\RadarConsentVerificationUsage;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\Evaluation\FieldScorer;
use App\Services\Ai\ModelResolver;
use App\Services\Ai\PromptRepository;
use App\Services\Radar\ConsentMessageComposer;
use App\Services\Radar\RadarConsentVerdict;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Laravel\Ai\Exceptions\RateLimitedException;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\TestCase;

/**
 * TCK-2388 (ADR-0076 §8, décision 6) — le jeu d'évaluation livré de `radar.verification_accord` : 15 cas de captures
 * SYNTHÉTIQUES (`render-captures.php`), chacun dans la forme exacte de ce que le job envoie
 * (`RadarConsentVerification::input()`), des attendus limités aux trois champs de `fields.json`. Aucun modèle réel :
 * `RadarConsentVerification::fake()`, y compris pour `ai:eval`.
 */
class RadarConsentVerificationEvalSetTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private const CAPTURE_MAX_BYTES = 100 * 1024;

    private const CLAUSES = 4;

    private EvaluationRunner $runner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        config([
            'ai.roles.vision' => [['provider' => 'anthropic', 'model' => 'modele-v', 'max_tokens' => 2000]],
            'ai.roles.raisonnement' => [['provider' => 'anthropic', 'model' => 'modele-r', 'max_tokens' => 2000]],
            'ai.pricing.anthropic.modele-v' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75],
            'ai.pricing.anthropic.modele-r' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.3, 'cache_write' => 3.75],
        ]);
        // Le catalogue, les prompts et le jeu RÉELS : c'est ce qui est livré qu'on éprouve.
        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry);
        $this->app->instance(PromptRepository::class, new PromptRepository);
        $this->runner = new EvaluationRunner(app(AiGateway::class), app(AiUsageRegistry::class), app(ModelResolver::class), new FieldScorer);
    }

    private function dir(): string
    {
        return base_path('resources/ai/evals/'.RadarConsentVerificationUsage::KEY);
    }

    /** @return list<array{input: string, expected: array<string, mixed>, attachments?: list<string>}> */
    private function cases(): array
    {
        return $this->runner->cases(RadarConsentVerificationUsage::KEY);
    }

    /**
     * Une sortie complète du schéma de l'agent dont les trois champs notés sont les attendus.
     *
     * @param  array<string, mixed>  $expected
     * @return array<string, mixed>
     */
    private function sortie(array $expected): array
    {
        return $expected + [
            'transcript' => 'Annonceur : OUI', 'reply_text' => 'OUI', 'counterpart_phone' => null, 'counterpart_name' => null,
            'name_matches' => null, 'confidence' => 'high',
        ];
    }

    public function test_le_jeu_a_quinze_cas_chacun_avec_une_capture_png_de_moins_de_100_ko(): void
    {
        $cases = $this->cases();

        $this->assertCount(15, $cases);
        foreach ($cases as $i => $case) {
            $this->assertNotEmpty($case['attachments'] ?? [], "cas {$i} : au moins une capture");
            foreach ($case['attachments'] as $relative) {
                $this->assertMatchesRegularExpression('#^captures/[0-9]{3}\.png$#', $relative);
                $path = $this->dir().'/'.$relative;
                $this->assertFileExists($path);
                $this->assertSame("\x89PNG\r\n\x1a\n", (string) file_get_contents($path, length: 8), "{$relative} n'est pas un PNG");
                $this->assertLessThan(self::CAPTURE_MAX_BYTES, filesize($path), "{$relative} est trop lourde");
                $this->assertSame(IMAGETYPE_PNG, getimagesize($path)[2] ?? null);
            }
        }
        // Chaque capture sert un seul cas.
        $this->assertCount(15, array_unique(array_merge(...array_column($cases, 'attachments'))));
    }

    /**
     * L'entrée d'un cas est exactement celle du job : le message envoyé, le numéro en E.164 COMPACT (`$advertiser->phone`,
     * sans espaces : l'en-tête de la capture, lui, l'affiche espacé), 4 clauses, un bloc de capture vide ; un cas porte
     * un annonceur sans nom (`inconnu`).
     */
    public function test_chaque_input_est_ce_que_le_job_envoie_avec_les_clauses_fixes_du_message(): void
    {
        $modele = (string) file_get_contents(resource_path('radar/clauses/accord.v1.fr.md'));
        $fixes = array_values(array_filter(array_map(
            'trim',
            (array) preg_split('/\{(?:salutation|resume|lien_conditions)\}/', $modele),
        ), fn (string $morceau) => $morceau !== ''));
        $this->assertCount(3, $fixes, 'le gabarit a trois segments fixes entre ses marqueurs');
        $this->assertSame(self::CLAUSES, $this->app->make(ConsentMessageComposer::class)->clauseCount());

        $inconnus = 0;
        foreach ($this->cases() as $i => $case) {
            $this->assertSame(1, preg_match('#^Message envoyé par Takussan \(texte exact\) :\n<<<\n(.*)\n>>>\nNuméro attendu : (\+22174\d{7})\nNom attendu : ([^\n]+)\nClauses numérotées : 1 à 4\n#s', $case['input'], $m), "cas {$i} : forme de l'entrée");
            [, $message, $numero, $nom] = $m;
            $inconnus += $nom === 'inconnu' ? 1 : 0;
            $this->assertSame(RadarConsentVerification::input($message, $numero, $nom, self::CLAUSES), $case['input'], "cas {$i} : pas la forme de RadarConsentVerification::input()");
            foreach ($fixes as $fixe) {
                $this->assertStringContainsString($fixe, $message, "cas {$i} : un segment fixe de accord.v1.fr.md manque");
            }
            $this->assertStringNotContainsString('{', $message, "cas {$i} : un marqueur non rempli");
        }
        $this->assertSame(1, $inconnus, 'un seul cas porte un annonceur sans nom');
    }

    public function test_les_attendus_ne_nomment_que_les_champs_notes_avec_des_valeurs_legales_et_couvrent_chaque_classement_et_chaque_discordance(): void
    {
        $fields = json_decode((string) file_get_contents($this->dir().'/fields.json'), true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame(['classification', 'clauses_found', 'number_matches'], collect(array_keys($fields))->sort()->values()->all());
        $this->assertNotContains('transcript', array_keys($fields));

        $classements = [];
        $discordances = [];
        foreach ($this->cases() as $i => $case) {
            $expected = $case['expected'];
            $this->assertSame(array_keys($fields), array_keys($expected), "cas {$i} : les attendus sont les champs de fields.json");
            $this->assertContains($expected['classification'], RadarConsentVerification::CLASSIFICATIONS, "cas {$i} : classification");
            $this->assertIsBool($expected['number_matches'], "cas {$i} : number_matches");
            $this->assertTrue(array_is_list($expected['clauses_found']), "cas {$i} : clauses_found");
            foreach ($expected['clauses_found'] as $clause) {
                $this->assertIsInt($clause);
                $this->assertGreaterThanOrEqual(1, $clause);
                $this->assertLessThanOrEqual(self::CLAUSES, $clause);
            }
            $classements[$expected['classification']] = true;

            // Ce que la relecture par le code en dirait d'une sortie égale aux attendus : le jeu couvre chaque discordance.
            foreach (RadarConsentVerdict::from($this->sortie($expected), '+22174100200', self::CLAUSES)['discordances'] as $discordance) {
                $discordances[$discordance] = true;
            }
        }

        $this->assertEqualsCanonicalizing(RadarConsentVerification::CLASSIFICATIONS, array_keys($classements));
        $this->assertEqualsCanonicalizing(['number_mismatch', 'clauses_missing', 'not_consent'], array_keys($discordances));
    }

    /**
     * Le jeu se joue de bout en bout sur faux modèle : une sortie égale aux attendus vaut 1.0 partout, sur le rôle
     * `vision` (des captures), et un champ faux ne baisse que le sien.
     */
    public function test_un_jeu_a_blanc_sur_des_sorties_egales_aux_attendus_vaut_un(): void
    {
        $cases = $this->cases();
        RadarConsentVerification::fake(array_map(fn (array $case): array => $this->sortie($case['expected']), $cases));

        $report = $this->runner->run(RadarConsentVerificationUsage::KEY);

        $this->assertSame(15, $report['cases']);
        $this->assertSame(0, $report['failures']);
        $this->assertSame(1.0, $report['global']);
        $this->assertSame(['classification' => 1.0, 'clauses_found' => 1.0, 'number_matches' => 1.0], array_map(fn ($s) => (float) $s, $report['fields']));
        $this->assertSame(['vision'], array_keys($report['roles']));
        $this->assertSame(15, $report['roles']['vision']['cases']);
        RadarConsentVerification::assertPromptedTimes(15);

        $faux = $cases;
        $faux[0]['expected']['classification'] = 'refusal';
        RadarConsentVerification::fake(array_map(fn (array $case): array => $this->sortie($case['expected']), $faux));

        $report = $this->runner->run(RadarConsentVerificationUsage::KEY);

        $this->assertSame(round(14 / 15, 4), $report['fields']['classification']);
        $this->assertSame(1.0, (float) $report['fields']['number_matches']);
        $this->assertSame(1.0, (float) $report['fields']['clauses_found']);
    }

    public function test_ac6_ai_eval_joue_le_jeu_livre_en_succes_et_echoue_si_le_modele_leve(): void
    {
        $rapports = storage_path('framework/testing/ai-evals-'.Str::random(8));
        try {
            $this->app->instance(EvaluationRunner::class, new EvaluationRunner(
                app(AiGateway::class), app(AiUsageRegistry::class), app(ModelResolver::class), new FieldScorer, null, $rapports,
            ));
            RadarConsentVerification::fake(array_map(fn (array $case): array => $this->sortie($case['expected']), $this->cases()));

            $this->artisan('ai:eval', ['usage' => RadarConsentVerificationUsage::KEY])->assertSuccessful();

            $rapport = json_decode((string) file_get_contents(File::files($rapports.'/'.RadarConsentVerificationUsage::KEY)[0]->getPathname()), true);
            $this->assertSame(15, $rapport['cases']);
            $this->assertSame(1.0, $rapport['global']);
            RadarConsentVerification::assertPromptedTimes(15);

            RadarConsentVerification::fake(fn () => throw RateLimitedException::forProvider('anthropic'));
            $this->artisan('ai:eval', ['usage' => RadarConsentVerificationUsage::KEY])
                ->expectsOutputToContain('ai.eval.failures')
                ->assertFailed();
        } finally {
            File::deleteDirectory($rapports);
        }
    }
}
