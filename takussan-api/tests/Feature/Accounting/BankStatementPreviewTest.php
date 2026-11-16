<?php

namespace Tests\Feature\Accounting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Support\RapprochementFixture;
use Tests\Support\RemoteDiskFake;

/**
 * TCK-2932 (AC2) — `POST /api/agencies/{agency}/bank-statements/preview` : ce que l'import lirait du
 * relevé — lignes lues, lignes sautées avec leur raison, période, dix premières lignes — SANS RIEN
 * ÉCRIRE : ni relevé, ni ligne, ni média, ni job. La garde compte les lignes de TOUTES les tables.
 */
class BankStatementPreviewTest extends ApiTestCase
{
    use RapprochementFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        RemoteDiskFake::install('r2-private');
        $this->setUpRapprochement();
    }

    private function preview(string $contents, string $name, ?string $format = null, ?User $as = null): TestResponse
    {
        $path = tempnam(sys_get_temp_dir(), 'apercu');
        file_put_contents($path, $contents);
        $this->beforeApplicationDestroyed(fn () => @unlink($path));

        $this->actingAsApi($as ?? $this->admin);

        return $this->postJson("/api/agencies/{$this->agency->id}/bank-statements/preview", array_filter([
            'file' => new UploadedFile($path, $name, null, null, true),
            'source_format' => $format,
        ]));
    }

    /** 12 lignes de données au mapping par défaut, dont la 4e (date impossible) et la 9e (montant illisible). */
    private function csv(): string
    {
        $rows = ['date,amount,label,reference,counterparty'];
        for ($i = 1; $i <= 12; $i++) {
            $day = str_pad((string) $i, 2, '0', STR_PAD_LEFT);
            $rows[] = match ($i) {
                4 => '31/13/2026,15000,Loyer illisible,,',
                9 => '09/11/2026,quinze mille,Montant illisible,,',
                default => "{$day}/11/2026,".($i === 3 ? '"-2500,5"' : (string) (10000 * $i)).",Loyer {$i},REF-{$i},Locataire {$i}",
            };
        }

        return implode("\n", $rows)."\n";
    }

    /** @return array<string, int> le nombre de lignes de chaque table */
    private function rowCounts(): array
    {
        $counts = [];
        foreach (Schema::getTableListing(schemaQualified: false) as $table) {
            $counts[$table] = DB::table($table)->count();
        }

        return $counts;
    }

    public function test_ac2_lit_10_lignes_en_saute_2_avec_leur_raison_et_n_ecrit_rien(): void
    {
        Queue::fake();
        $before = $this->rowCounts();

        $data = $this->preview($this->csv(), 'releve.csv', 'csv')->assertOk()->json('data');

        $this->assertSame($before, $this->rowCounts(), 'l\'aperçu n\'écrit aucune ligne, dans aucune table');
        $this->assertSame(0, DB::table('bank_statements')->count());
        $this->assertSame(0, DB::table('bank_statement_lines')->count());
        $this->assertSame(0, DB::table('media')->count());
        Queue::assertNothingPushed();

        $this->assertSame('csv', $data['source_format']);
        $this->assertSame(10, $data['read']);
        $this->assertSame(2, $data['skipped']);
        $this->assertSame(['invalid_amount' => 1, 'invalid_date' => 1], $data['skipped_by_reason']);
        $this->assertSame([['line' => 4, 'reason' => 'invalid_date'], ['line' => 9, 'reason' => 'invalid_amount']], $data['skipped_lines']);
        $this->assertSame(['start' => '2026-11-01', 'end' => '2026-11-12'], $data['period']);
        $this->assertCount(10, $data['lines']);
        $this->assertFalse($data['already_imported']);

        // Le montant est décimal, en chaîne, et le sens se lit du signe.
        $this->assertSame([
            'date' => '2026-11-03', 'amount' => '2500.50', 'direction' => 'debit', 'currency' => 'XOF',
            'label' => 'Loyer 3', 'reference' => 'REF-3', 'counterparty' => 'Locataire 3',
        ], $data['lines'][2]);
        $this->assertSame('100000.00', $data['lines'][7]['amount'], 'la 10e ligne de données, 8e lue');
    }

    public function test_seules_les_dix_premieres_lignes_sont_rendues(): void
    {
        $rows = ['date,amount,label,reference,counterparty'];
        for ($i = 1; $i <= 25; $i++) {
            $rows[] = sprintf('%02d/10/2026,%d,Loyer %d,,', $i, 1000 * $i, $i);
        }

        $data = $this->preview(implode("\n", $rows), 'releve.csv')->assertOk()->json('data');

        $this->assertSame(25, $data['read']);
        $this->assertSame(0, $data['skipped']);
        $this->assertEquals(new \ArrayObject, new \ArrayObject($data['skipped_by_reason']));
        $this->assertCount(10, $data['lines']);
        $this->assertSame(['start' => '2026-10-01', 'end' => '2026-10-25'], $data['period']);
    }

    public function test_un_ofx_se_lit_aussi(): void
    {
        $ofx = '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>XOF<BANKTRANLIST>'
            .'<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261001</DTPOSTED><TRNAMT>150000</TRNAMT><FITID>B1</FITID><NAME>LOYER</NAME></STMTTRN>'
            .'<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261399</DTPOSTED><TRNAMT>75000</TRNAMT><FITID>B2</FITID><NAME>DATE FAUSSE</NAME></STMTTRN>'
            .'</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>';

        $data = $this->preview($ofx, 'releve.ofx')->assertOk()->json('data');

        $this->assertSame(['ofx', 1, 1], [$data['source_format'], $data['read'], $data['skipped']]);
        $this->assertSame([['line' => 2, 'reason' => 'invalid_date']], $data['skipped_lines']);
        $this->assertSame('150000.00', $data['lines'][0]['amount']);
        $this->assertSame(0, DB::table('bank_statements')->count());
    }

    public function test_un_fichier_deja_importe_est_signale_et_pas_refuse(): void
    {
        $csv = $this->csv();
        $this->statement(['file_hash' => hash('sha256', $csv)]);

        $this->preview($csv, 'releve.csv')->assertOk()->assertJsonPath('data.already_imported', true);
    }

    public function test_droit_et_corps_de_l_import(): void
    {
        $this->preview($this->csv(), 'releve.csv', as: $this->agent)->assertForbidden();
        $this->preview($this->csv(), 'releve.csv', as: $this->otherAdmin)->assertForbidden();
        // Le refus d'encodage de l'import vaut pour l'aperçu.
        $this->preview(mb_convert_encoding("date,amount,label\n01/11/2026,1000,Loyer café\n", 'ISO-8859-1', 'UTF-8'), 'releve.csv')
            ->assertUnprocessable()->assertJsonValidationErrors('file');
        $this->preview($this->csv(), 'releve.csv', 'pdf')->assertUnprocessable()->assertJsonValidationErrors('source_format');
    }

    /**
     * Un en-tête que le lecteur CSV refuse (colonnes en double ou vides, fréquentes dans les exports
     * bancaires à `;;` final) et un fichier vide : un 422 codé, jamais un 500, et toujours rien d'écrit.
     */
    public function test_un_fichier_que_le_pilote_ne_peut_ouvrir_rend_un_422_code(): void
    {
        $before = $this->rowCounts();

        foreach (["date,amount,label,,\n01/11/2026,1000,Loyer,,\n", "date,amount,amount\n01/11/2026,1000,1000\n"] as $csv) {
            $this->preview($csv, 'releve.csv', 'csv')->assertUnprocessable()->assertJsonPath('code', 'reconciliation.preview_unreadable');
        }
        $this->preview('', 'releve.csv', 'csv')->assertUnprocessable();

        $this->assertSame($before, $this->rowCounts());
    }
}
