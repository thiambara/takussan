<?php

namespace Tests\Feature\Database;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * TCK-2793 (ADR-0039, amendement du 2026-11-14) — la migration de la comptabilité de la pénalité
 * payée seule a un `down()` réel, et `up()` se rejoue après lui. Le patron de
 * `BankReconciliationSchemaMigrationsTest` : le DDL de PostgreSQL est transactionnel, l'aller-retour
 * se défait avec le test.
 */
class PenaliteSeuleComptabiliteMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const LEASE_COLUMNS = ['late_fee_platform_payout_id', 'late_fee_bank_reconciled_at', 'late_fee_bank_statement_line_id'];

    private const INDEXES = ['lease_payments_late_fee_platform_payout_idx', 'lease_payments_late_fee_bank_line_unique'];

    private const FOREIGN_KEYS = ['lease_payments_late_fee_platform_payout_fk', 'lease_payments_late_fee_bank_line_fk'];

    private function indexExists(string $name): bool
    {
        return DB::table('pg_indexes')->where('indexname', $name)->exists();
    }

    private function foreignKeyExists(string $name): bool
    {
        return DB::table('information_schema.table_constraints')
            ->where('constraint_name', $name)->where('constraint_type', 'FOREIGN KEY')->exists();
    }

    private function assertUp(): void
    {
        $this->assertTrue(Schema::hasColumns('lease_payments', self::LEASE_COLUMNS));
        $this->assertTrue(Schema::hasColumn('bank_statement_lines', 'matched_part'));
        foreach (self::INDEXES as $index) {
            $this->assertTrue($this->indexExists($index), $index);
        }
        foreach (self::FOREIGN_KEYS as $fk) {
            $this->assertTrue($this->foreignKeyExists($fk), $fk);
        }
    }

    public function test_les_colonnes_de_la_penalite_seule_vont_et_viennent(): void
    {
        $migration = require database_path('migrations/2026_11_14_100000_add_late_fee_alone_accounting_to_lease_payments.php');
        $this->assertUp();

        $migration->down();
        foreach (self::LEASE_COLUMNS as $column) {
            $this->assertFalse(Schema::hasColumn('lease_payments', $column), $column);
        }
        $this->assertFalse(Schema::hasColumn('bank_statement_lines', 'matched_part'));
        foreach (self::INDEXES as $index) {
            $this->assertFalse($this->indexExists($index), $index);
        }
        foreach (self::FOREIGN_KEYS as $fk) {
            $this->assertFalse($this->foreignKeyExists($fk), $fk);
        }

        $migration->up();
        $this->assertUp();
    }
}
