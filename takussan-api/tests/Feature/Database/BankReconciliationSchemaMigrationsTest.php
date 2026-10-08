<?php

namespace Tests\Feature\Database;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * TCK-593 — les deux migrations du rapprochement ont un `down()` réel, et `up()` se rejoue après
 * lui. Le DDL de PostgreSQL est transactionnel : l'aller-retour se défait avec le test.
 */
class BankReconciliationSchemaMigrationsTest extends TestCase
{
    use RefreshDatabase;

    private function migration(string $name): object
    {
        return require database_path("migrations/{$name}.php");
    }

    private function indexExists(string $name): bool
    {
        return DB::table('pg_indexes')->where('indexname', $name)->exists();
    }

    public function test_les_colonnes_de_rapprochement_des_reversements_vont_et_viennent(): void
    {
        $migration = $this->migration('2026_10_07_150200_add_bank_reconciliation_to_payouts_table');
        $this->assertTrue(Schema::hasColumns('payouts', ['bank_reconciled_at', 'bank_statement_line_id']));
        $this->assertTrue($this->indexExists('payouts_bank_line_unique'));

        $migration->down();
        $this->assertFalse(Schema::hasColumn('payouts', 'bank_reconciled_at'));
        $this->assertFalse(Schema::hasColumn('payouts', 'bank_statement_line_id'));
        $this->assertFalse($this->indexExists('payouts_bank_line_unique'));

        $migration->up();
        $this->assertTrue(Schema::hasColumns('payouts', ['bank_reconciled_at', 'bank_statement_line_id']));
        $this->assertTrue($this->indexExists('payouts_bank_line_unique'));
    }

    public function test_l_instantane_du_mapping_et_le_compte_des_lignes_sautees_vont_et_viennent(): void
    {
        $migration = $this->migration('2026_10_07_150300_add_parse_outcome_to_bank_statements_table');
        $this->assertTrue(Schema::hasColumns('bank_statements', ['csv_mapping', 'skipped_lines_count']));
        $this->assertSame('jsonb', Schema::getColumnType('bank_statements', 'csv_mapping'));

        $migration->down();
        $this->assertFalse(Schema::hasColumn('bank_statements', 'csv_mapping'));
        $this->assertFalse(Schema::hasColumn('bank_statements', 'skipped_lines_count'));

        $migration->up();
        $this->assertTrue(Schema::hasColumns('bank_statements', ['csv_mapping', 'skipped_lines_count']));
    }
}
