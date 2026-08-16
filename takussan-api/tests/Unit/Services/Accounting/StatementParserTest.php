<?php

namespace Tests\Unit\Services\Accounting;

use App\Models\Agency;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementSourceFormat;
use App\Models\Enums\Currency;
use App\Services\Accounting\StatementParser\CsvDriver;
use App\Services\Accounting\StatementParser\OfxDriver;
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
        $driver = new CsvDriver;

        // "1,234.56" (US thousands), "1.234,56" (EU thousands), "7500,50"
        // (comma decimal). The old str_replace turned every comma into a
        // decimal point, corrupting the first two by 1000×.
        $csv = "date,amount,label,reference,counterparty\n"
            ."01/04/2026,\"1,234.56\",A,R1,C1\n"
            ."02/04/2026,\"1.234,56\",B,R2,C2\n"
            ."03/04/2026,\"7500,50\",C,R3,C3\n";

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
        @unlink($path);

        $this->assertCount(3, $lines);
        $this->assertEqualsWithDelta(1234.56, $lines[0]->amount, 0.001);
        $this->assertEqualsWithDelta(1234.56, $lines[1]->amount, 0.001);
        $this->assertEqualsWithDelta(7500.50, $lines[2]->amount, 0.001);
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
