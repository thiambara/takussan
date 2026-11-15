<?php

namespace Tests\Feature\Accounting;

use App\Models\Agency;
use App\Models\Enums\BankStatementSourceFormat;
use App\Models\Enums\Currency;
use App\Services\Accounting\StatementParser\BankPresetRegistry;
use App\Services\Accounting\StatementParser\CsvDriver;
use App\Services\Accounting\StatementParser\ParserContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Support\RapprochementFixture;

/**
 * TCK-2932 (AC3) — `GET /api/agencies/{agency}/reconciliation/supported-formats` : les formats que
 * l'import lit, et les banques à préréglage ÉPROUVÉ sur un export réel (D-67) — aucune aujourd'hui.
 */
class SupportedFormatsTest extends ApiTestCase
{
    use RapprochementFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpRapprochement();
    }

    private function formats(): TestResponse
    {
        $this->actingAsApi($this->admin);

        return $this->getJson("/api/agencies/{$this->agency->id}/reconciliation/supported-formats");
    }

    /** Un registre de test : un préréglage FICTIF, avec ou sans fichier d'épreuve. */
    private function registryWith(string $fixture): void
    {
        $this->app->instance(BankPresetRegistry::class, new class($fixture) extends BankPresetRegistry
        {
            public function __construct(private readonly string $fixture) {}

            public function declared(): array
            {
                return [[
                    'code' => 'banque_fictive', 'name' => 'Banque fictive', 'format' => 'csv',
                    'mapping' => CsvDriver::DEFAULT_MAPPING, 'fixture' => $this->fixture,
                ]];
            }
        });
    }

    public function test_ac3_csv_et_ofx_et_aucune_banque_tant_qu_aucun_prereglage_n_est_eprouve(): void
    {
        $this->formats()->assertOk()->assertExactJson(['data' => [
            'formats' => [
                ['code' => 'csv', 'extensions' => ['csv', 'txt'], 'configurable_columns' => true],
                ['code' => 'ofx', 'extensions' => ['ofx', 'xml'], 'configurable_columns' => false],
            ],
            'banks' => [],
        ]]);
    }

    public function test_ac3_un_prereglage_avec_son_fichier_d_epreuve_parait(): void
    {
        $this->registryWith('tests/Fixtures/bank/sample.csv');

        $this->formats()->assertOk()
            ->assertJsonPath('data.banks.0.code', 'banque_fictive')
            ->assertJsonPath('data.banks.0.format', 'csv')
            ->assertJsonPath('data.banks.0.mapping.date_column', 'date');
    }

    public function test_un_prereglage_sans_fichier_d_epreuve_n_est_pas_servi(): void
    {
        $this->registryWith('tests/Fixtures/bank/absent.csv');

        $this->formats()->assertOk()->assertJsonPath('data.banks', []);
    }

    /**
     * D-67 — tout préréglage DÉCLARÉ dans le code lit son export réel sans sauter une ligne. Vide
     * aujourd'hui : le premier préréglage ajouté devra passer cette épreuve.
     */
    public function test_chaque_prereglage_declare_lit_son_export_sans_sauter_de_ligne(): void
    {
        $registry = new BankPresetRegistry;
        $this->assertSame($registry->declared(), $registry->presets(), 'un préréglage déclaré sans son fichier d\'épreuve');

        $agency = Agency::factory()->create(['currency' => Currency::XOF]);
        foreach ($registry->presets() as $preset) {
            $this->assertSame(BankStatementSourceFormat::Csv->value, $preset['format'], $preset['code']);
            $context = new ParserContext($agency, BankStatementSourceFormat::Csv, $preset['mapping']);
            $lines = iterator_to_array((new CsvDriver)->parse(base_path($preset['fixture']), $context), false);
            $this->assertNotEmpty($lines, $preset['code']);
            $this->assertSame(0, $context->tally->skipped, $preset['code']);
        }
        $this->addToAssertionCount(1);
    }

    public function test_reserve_a_qui_rapproche(): void
    {
        $this->actingAsApi($this->agent);
        $this->getJson("/api/agencies/{$this->agency->id}/reconciliation/supported-formats")->assertForbidden();
        $this->actingAsApi($this->otherAdmin);
        $this->getJson("/api/agencies/{$this->agency->id}/reconciliation/supported-formats")->assertForbidden();
    }
}
