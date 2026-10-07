<?php

namespace Tests\Feature\Api\Accounting;

use App\Jobs\Accounting\ParseBankStatementJob;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\Currency;
use App\Models\User;
use App\Services\Accounting\StatementParser\CsvDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Tests\ApiTestCase;
use Tests\Support\RemoteDiskFake;

/**
 * TCK-593 (AC17) — le mapping CSV de l'agence : réglable par son admin seul, le séparateur
 * décimal toujours déclaré, et figé sur chaque relevé à l'import.
 */
class BankCsvMappingTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        RemoteDiskFake::install('r2-private');

        $this->agency = Agency::factory()->create(['currency' => Currency::XOF]);
        $this->admin = User::factory()->create(['agency_id' => $this->agency->id]);
        $this->agency->update(['primary_admin_id' => $this->admin->id]);
    }

    /** @return array<string, mixed> */
    private function mapping(array $overrides = []): array
    {
        return array_merge([
            'delimiter' => ';',
            'has_header' => true,
            'date_column' => 'Date',
            'date_format' => 'd/m/Y',
            'amount_column' => 'Montant',
            'label_column' => 'Libellé',
            'reference_column' => null,
            'counterparty_column' => null,
            'currency_column' => null,
            'sign_convention' => 'amount_signed',
            'direction_column' => null,
            'decimal_separator' => ',',
            'thousands_separator' => ' ',
        ], $overrides);
    }

    private function url(): string
    {
        return "/api/agencies/{$this->agency->id}/bank-statements/csv-mapping";
    }

    public function test_la_lecture_rend_le_mapping_effectif_par_defaut(): void
    {
        $this->actingAs($this->admin)->getJson($this->url())
            ->assertOk()
            ->assertJsonPath('data.date_column', 'date')
            ->assertJsonPath('data.decimal_separator', ',')
            ->assertJsonPath('data.thousands_separator', null);
    }

    public function test_l_admin_enregistre_le_mapping(): void
    {
        $this->actingAs($this->admin)->putJson($this->url(), $this->mapping(['date_column' => 0, 'amount_column' => 2, 'has_header' => false]))
            ->assertOk()
            ->assertJsonPath('data.date_column', 0)
            ->assertJsonPath('data.amount_column', 2)
            ->assertJsonPath('data.thousands_separator', ' ');

        $this->assertSame(0, $this->agency->refresh()->bank_csv_mapping['date_column']);
    }

    public function test_la_tabulation_et_l_espace_survivent_au_trim(): void
    {
        // Le trim global réduisait `"\t"` et `' '` à `null` : un export tabulé était impossible à
        // déclarer, et l'espace de milliers revenait « aucun ».
        $this->actingAs($this->admin)->putJson($this->url(), $this->mapping(['delimiter' => "\t", 'thousands_separator' => ' ']))
            ->assertOk()
            ->assertJsonPath('data.delimiter', "\t")
            ->assertJsonPath('data.thousands_separator', ' ');
    }

    public function test_sans_decimal_separator_le_mapping_est_refuse(): void
    {
        $payload = $this->mapping();
        unset($payload['decimal_separator']);

        $this->actingAs($this->admin)->putJson($this->url(), $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors('decimal_separator');

        $this->actingAs($this->admin)->putJson($this->url(), $this->mapping(['decimal_separator' => 'x']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('decimal_separator');

        $this->assertNull($this->agency->refresh()->bank_csv_mapping);
    }

    public function test_un_agent_non_admin_recoit_403(): void
    {
        $agent = User::factory()->create(['agency_id' => $this->agency->id]);

        $this->actingAs($agent)->putJson($this->url(), $this->mapping())->assertForbidden();
        $this->actingAs($agent)->getJson($this->url())->assertForbidden();
        $this->assertNull($this->agency->refresh()->bank_csv_mapping);
    }

    public function test_l_admin_d_une_autre_agence_recoit_403(): void
    {
        $other = Agency::factory()->create();
        $otherAdmin = User::factory()->create(['agency_id' => $other->id]);
        $other->update(['primary_admin_id' => $otherAdmin->id]);

        $this->actingAs($otherAdmin)->putJson($this->url(), $this->mapping())->assertForbidden();
    }

    public function test_le_mapping_fige_sur_un_releve_n_est_pas_reinterprete(): void
    {
        Queue::fake();

        $this->actingAs($this->admin)->putJson($this->url(), $this->mapping())->assertOk();

        $id = $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => UploadedFile::fake()->createWithContent('s.csv', "Date;Montant;Libellé\n01/04/2026;150 000;A\n"),
                'source_format' => 'csv',
            ])
            ->assertStatus(202)
            ->json('data.id');

        $statement = BankStatement::findOrFail($id);
        $this->assertSame(';', $statement->csv_mapping['delimiter']);
        $this->assertSame(',', $statement->csv_mapping['decimal_separator']);

        // L'agence change de banque, donc de format : le relevé déjà importé garde le sien.
        $this->actingAs($this->admin)
            ->putJson($this->url(), $this->mapping(['delimiter' => ',', 'decimal_separator' => '.', 'thousands_separator' => ',']))
            ->assertOk();

        $statement->refresh();
        $this->assertSame(';', $statement->csv_mapping['delimiter']);
        $this->assertSame(',', $statement->csv_mapping['decimal_separator']);
        $this->assertSame(' ', $statement->csv_mapping['thousands_separator']);

        // Et l'analyse, jouée APRÈS le changement, lit l'instantané : au mapping actuel de
        // l'agence (virgule), ce fichier à point-virgule ne donnerait aucune ligne.
        app()->call([new ParseBankStatementJob($statement->id), 'handle']);

        $statement->refresh();
        $this->assertSame(BankStatementStatus::ReadyForReview, $statement->status);
        $this->assertSame(1, $statement->lines_count);
        $this->assertSame('150000.00', (string) $statement->lines()->sole()->amount);
    }

    public function test_une_agence_sans_mapping_fige_le_defaut_effectif(): void
    {
        // Vérification adverse (AC17a) — figer `$agency->bank_csv_mapping` BRUT laissait
        // `csv_mapping = null` sur le relevé d'une agence sans mapping : le job lisait alors le
        // mapping de l'agence au moment de l'ANALYSE, et le gel promis n'avait pas lieu.
        Queue::fake();
        $this->assertNull($this->agency->bank_csv_mapping);

        $id = $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => UploadedFile::fake()->createWithContent('s.csv', "date,amount,label\n01/04/2026,150000,A\n"),
                'source_format' => 'csv',
            ])
            ->assertStatus(202)
            ->json('data.id');

        $statement = BankStatement::findOrFail($id);
        // `jsonb` range les clés à sa façon : on compare les valeurs, pas l'ordre.
        $expected = CsvDriver::effectiveMapping(null);
        $frozen = $statement->csv_mapping;
        $this->assertIsArray($frozen);
        ksort($expected);
        ksort($frozen);
        $this->assertSame($expected, $frozen);

        // L'agence règle ensuite un mapping à point-virgule : le relevé déjà importé se lit au
        // défaut figé, pas au mapping actuel (qui n'y trouverait aucune ligne).
        $this->actingAs($this->admin)->putJson($this->url(), $this->mapping())->assertOk();
        app()->call([new ParseBankStatementJob($statement->id), 'handle']);

        $statement->refresh();
        $this->assertSame(BankStatementStatus::ReadyForReview, $statement->status);
        $this->assertSame(1, $statement->lines_count);
        $this->assertSame('150000.00', (string) $statement->lines()->sole()->amount);
    }
}
