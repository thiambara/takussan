<?php

namespace Tests\Unit\Services\Accounting;

use App\Models\Agency;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementSourceFormat;
use App\Models\Enums\Currency;
use App\Services\Accounting\StatementParser\CsvDriver;
use App\Services\Accounting\StatementParser\OfxDriver;
use App\Services\Accounting\StatementParser\ParsedLine;
use App\Services\Accounting\StatementParser\ParserContext;
use App\Services\Accounting\StatementParser\StatementParserFactory;
use Tests\Support\TestProcessToken;
use Tests\TestCase;

class StatementParserTest extends TestCase
{
    protected function agencyStub(): Agency
    {
        $agency = new Agency;
        $agency->currency = Currency::XOF;
        $agency->bank_csv_mapping = null;

        return $agency;
    }

    // ─── CSV Tests ───────────────────────────────────────────────

    public function test_csv_driver_parses_sample_file(): void
    {
        $driver = new CsvDriver;
        $path = base_path('tests/fixtures/bank/sample.csv');

        $context = new ParserContext(
            agency: $this->agencyStub(),
            format: BankStatementSourceFormat::Csv,
            csvMapping: [
                'delimiter' => ',',
                'has_header' => true,
                'date_column' => 'date',
                'date_format' => 'd/m/Y',
                'amount_column' => 'amount',
                'label_column' => 'label',
                'reference_column' => 'reference',
                'counterparty_column' => 'counterparty',
                'sign_convention' => 'amount_signed',
            ],
        );

        $lines = iterator_to_array($driver->parse($path, $context));

        $this->assertCount(10, $lines);

        // First line: credit
        $first = $lines[0];
        $this->assertEquals('2026-04-01', $first->postedAt->toDateString());
        $this->assertEquals(15000.0, $first->amount);
        $this->assertEquals(BankStatementLineDirection::Credit, $first->direction);
        $this->assertEquals('XOF', $first->currency);
        $this->assertEquals('Loyer Avril LP-2026-001', $first->label);
        $this->assertEquals('LP-2026-001', $first->reference);
        $this->assertEquals('Mamadou Diop', $first->counterparty);

        // Third line: debit (negative amount)
        $debit = $lines[2];
        $this->assertEquals(5000.0, $debit->amount);
        $this->assertEquals(BankStatementLineDirection::Debit, $debit->direction);

        // Last line: no counterparty
        $last = $lines[9];
        $this->assertEquals(12000.0, $last->amount);
        $this->assertEquals('Unknown', $last->counterparty);
    }

    public function test_csv_amount_parsing_handles_thousands_and_decimal_separators(): void
    {
        // "1,234.56" (US thousands), "1.234,56" (EU thousands), "7500,50"
        // (comma decimal). The old str_replace turned every comma into a
        // decimal point, corrupting the first two by 1000×.
        // TCK-593 — les séparateurs sont DÉCLARÉS par le mapping, un fichier à la fois : un même
        // fichier ne mélange pas deux conventions, et deviner a produit l'erreur ×1000 de `150,000`.
        $us = $this->parseCsv("date,amount,label\n01/04/2026,\"1,234.56\",A\n", ['decimal_separator' => '.', 'thousands_separator' => ',']);
        $eu = $this->parseCsv("date,amount,label\n02/04/2026,\"1.234,56\",B\n", ['decimal_separator' => ',', 'thousands_separator' => '.']);
        $comma = $this->parseCsv("date,amount,label\n03/04/2026,\"7500,50\",C\n", []);

        $this->assertEqualsWithDelta(1234.56, $us['lines'][0]->amount, 0.001);
        $this->assertEqualsWithDelta(1234.56, $eu['lines'][0]->amount, 0.001);
        $this->assertEqualsWithDelta(7500.50, $comma['lines'][0]->amount, 0.001);
    }

    // ─── TCK-593 — séparateurs déclarés, lignes sautées comptées ─

    public function test_un_espace_insecable_de_milliers_donne_150000_et_non_150(): void
    {
        // AC16 — l'export français : « 150 000 » avec U+00A0, et « 150 000 » avec U+202F.
        $result = $this->parseCsv(
            "date,amount,label\n01/04/2026,150\u{00A0}000,A\n02/04/2026,150\u{202F}000,B\n03/04/2026,150 000,C\n",
            [],
        );

        $this->assertCount(3, $result['lines']);
        foreach ($result['lines'] as $line) {
            $this->assertEqualsWithDelta(150000.0, $line->amount, 0.001);
        }
        $this->assertSame(0, $result['context']->tally->skipped);
    }

    public function test_150_000_au_format_anglo_saxon_est_lu_150000_quand_il_est_declare(): void
    {
        // AC16 — `decimal_separator='.'`, `thousands_separator=','` : cent cinquante mille.
        $declared = $this->parseCsv("date,amount,label\n01/04/2026,\"150,000\",A\n", ['decimal_separator' => '.', 'thousands_separator' => ',']);
        $this->assertEqualsWithDelta(150000.0, $declared['lines'][0]->amount, 0.001);

        // Le même fichier lu au défaut (virgule décimale) : 150,000 vaut 150 — c'est ce que la
        // déclaration tranche, au lieu d'une devinette.
        $default = $this->parseCsv("date,amount,label\n01/04/2026,\"150,000\",A\n", []);
        $this->assertEqualsWithDelta(150.0, $default['lines'][0]->amount, 0.001);
    }

    public function test_les_lignes_illisibles_sont_sautees_et_comptees(): void
    {
        // AC16 — 10 lignes dont 2 illisibles (un montant non numérique, une date vide) : 8 lues,
        // 2 comptées.
        $rows = [];
        for ($i = 1; $i <= 8; $i++) {
            $rows[] = sprintf('%02d/04/2026,%d,L%d', $i, 1000 * $i, $i);
        }
        $rows[] = '09/04/2026,abc,ILLISIBLE';
        $rows[] = ',5000,SANS-DATE';

        $result = $this->parseCsv("date,amount,label\n".implode("\n", $rows)."\n", []);

        $this->assertCount(8, $result['lines']);
        $this->assertSame(2, $result['context']->tally->skipped);
    }

    public function test_des_colonnes_introuvables_font_sauter_et_compter_chaque_ligne(): void
    {
        // AC16 — un export dont les colonnes s'appellent `Date` et `Montant` : le code d'avant
        // rendait zéro ligne SANS RIEN COMPTER (`return null`).
        $csv = "Date,Montant,Libelle\n";
        for ($i = 1; $i <= 5; $i++) {
            $csv .= sprintf("%02d/04/2026,%d,L%d\n", $i, 1000 * $i, $i);
        }

        $result = $this->parseCsv($csv, []);

        $this->assertCount(0, $result['lines']);
        $this->assertSame(5, $result['context']->tally->skipped);
    }

    public function test_une_date_debordante_est_sautee_et_non_decalee(): void
    {
        // AC16 — `31/13/2026` en `d/m/Y` : `createFromFormat` rendait le 2027-01-31 sans erreur.
        $result = $this->parseCsv("date,amount,label\n31/13/2026,1000,DEBORD\n32/01/2026,1000,DEBORD2\n15/04/2026,2000,OK\n", []);

        $this->assertCount(1, $result['lines']);
        $this->assertSame('2026-04-15', $result['lines'][0]->postedAt->toDateString());
        $this->assertSame(2, $result['context']->tally->skipped);
    }

    public function test_un_point_non_declare_n_est_pas_lu_comme_decimale(): void
    {
        // Vérification adverse R1 — au mapping par défaut (virgule décimale, aucun séparateur de
        // milliers), `150.000` était lu 150. Il est sauté et compté ; `150,5` reste lu.
        $default = $this->parseCsv("date,amount,label\n01/04/2026,150.000,A\n02/04/2026,\"150,5\",B\n", []);
        $this->assertCount(1, $default['lines']);
        $this->assertEqualsWithDelta(150.5, $default['lines'][0]->amount, 0.001);
        $this->assertSame(1, $default['context']->tally->skipped);

        // Avec le point déclaré décimal, une virgule non déclarée est sautée de même.
        $point = $this->parseCsv("date,amount,label\n01/04/2026,\"150,000\",A\n", ['decimal_separator' => '.']);
        $this->assertCount(0, $point['lines']);
        $this->assertSame(1, $point['context']->tally->skipped);
    }

    public function test_le_sens_par_colonne_reconnait_les_valeurs_francaises_et_saute_les_autres(): void
    {
        // Vérification adverse R2 — « Débit », « D » et une valeur vide étaient lus comme des
        // crédits, et un montant négatif stocké négatif.
        $csv = "date,amount,label,sens\n"
            ."01/04/2026,285000,A,Débit\n"
            ."02/04/2026,285000,B,D\n"
            ."03/04/2026,285000,C,DR\n"
            ."04/04/2026,285000,D,Crédit\n"
            ."05/04/2026,-285000,E,cr\n"
            ."06/04/2026,285000,F,\n"
            ."07/04/2026,285000,G,virement\n";

        $result = $this->parseCsv($csv, ['sign_convention' => 'direction_column', 'direction_column' => 'sens']);

        $this->assertSame(
            ['debit', 'debit', 'debit', 'credit', 'credit'],
            array_map(fn ($l) => $l->direction->value, $result['lines']),
        );
        foreach ($result['lines'] as $line) {
            $this->assertEqualsWithDelta(285000.0, $line->amount, 0.001);
        }
        $this->assertSame(2, $result['context']->tally->skipped);
    }

    /**
     * @param  array<string, mixed>  $mapping  recouvre le mapping effectif par défaut
     * @return array{lines: list<ParsedLine>, context: ParserContext}
     */
    private function parseCsv(string $csv, array $mapping): array
    {
        // `tempnam()` réserve un chemin de façon atomique — mais le `.csv` concaténé APRÈS n'est
        // pas le chemin réservé : la garantie d'unicité est perdue au moment précis où on croit
        // l'avoir, et le fichier réellement réservé fuit à chaque exécution. Même famille que la
        // course de `WatermarkServiceTest` ; on construit donc le chemin explicitement, discriminé
        // par processus (entre exécutions simultanées) et par `uniqid()` (au sein d'une exécution).
        $path = sys_get_temp_dir().'/stmt_'.TestProcessToken::value().'_'.uniqid().'.csv';
        file_put_contents($path, $csv);

        $context = new ParserContext(
            agency: $this->agencyStub(),
            format: BankStatementSourceFormat::Csv,
            csvMapping: $mapping,
        );

        try {
            $lines = iterator_to_array((new CsvDriver)->parse($path, $context), false);
        } finally {
            @unlink($path);
        }

        return ['lines' => $lines, 'context' => $context];
    }

    // ─── OFX Tests ───────────────────────────────────────────────

    public function test_ofx_driver_parses_sample_file(): void
    {
        $driver = new OfxDriver;
        $path = base_path('tests/fixtures/bank/sample.ofx');

        $context = new ParserContext(
            agency: $this->agencyStub(),
            format: BankStatementSourceFormat::Ofx,
        );

        $lines = iterator_to_array($driver->parse($path, $context));

        $this->assertCount(5, $lines);

        // First: CREDIT 15000 XOF
        $first = $lines[0];
        $this->assertEquals('2026-04-01', $first->postedAt->toDateString());
        $this->assertEquals(15000.0, $first->amount);
        $this->assertEquals(BankStatementLineDirection::Credit, $first->direction);
        $this->assertEquals('XOF', $first->currency);
        $this->assertEquals('Mamadou Diop', $first->label);
        $this->assertEquals('TXN20260401001', $first->reference);
        $this->assertEquals('Mamadou Diop', $first->counterparty);

        // Third: DEBIT 5000
        $debit = $lines[2];
        $this->assertEquals(5000.0, $debit->amount);
        $this->assertEquals(BankStatementLineDirection::Debit, $debit->direction);
    }

    // ─── Factory Test ────────────────────────────────────────────

    public function test_factory_returns_correct_driver(): void
    {
        $factory = new StatementParserFactory;

        $this->assertInstanceOf(CsvDriver::class, $factory->for(BankStatementSourceFormat::Csv));
        $this->assertInstanceOf(OfxDriver::class, $factory->for(BankStatementSourceFormat::Ofx));
    }
}
