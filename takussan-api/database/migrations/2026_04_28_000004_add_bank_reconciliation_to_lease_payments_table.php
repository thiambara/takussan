<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lease_payments', function (Blueprint $table) {
            $table->dateTime('bank_reconciled_at')->nullable()->after('paid_at');
            $table->unsignedBigInteger('bank_statement_line_id')->nullable()->after('bank_reconciled_at');
            $table->foreign('bank_statement_line_id')->references('id')->on('bank_statement_lines')->nullOnDelete();
        });

        $this->addPartialUnique('lease_payments', 'bank_statement_line_id');
    }

    public function down(): void
    {
        Schema::table('lease_payments', function (Blueprint $table) {
            $table->dropForeign(['bank_statement_line_id']);
            $table->dropColumn(['bank_reconciled_at', 'bank_statement_line_id']);
        });
    }

    private function addPartialUnique(string $table, string $column): void
    {
        $driver = DB::getDriverName();

        if (in_array($driver, ['pgsql', 'sqlite'], true)) {
            DB::statement("CREATE UNIQUE INDEX {$table}_bank_line_unique ON {$table} ({$column}) WHERE {$column} IS NOT NULL");
        } else {
            Schema::table($table, fn (Blueprint $t) => $t->unique($column, "{$table}_bank_line_unique"));
        }
    }
};
