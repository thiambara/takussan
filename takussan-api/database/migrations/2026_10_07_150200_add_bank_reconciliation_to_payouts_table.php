<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-593 — un reversement se rapproche comme un encaissement, dans l'autre sens.
 *
 * Mêmes colonnes que les trois tables d'encaissement (`2026_04_28_00000{3,4,5}`). L'index unique
 * PARTIEL garantit qu'un reversement n'est rapproché qu'à une seule ligne de relevé, sans compter
 * les `NULL`. Noms explicites : le nom auto-généré de la FK frôlerait la limite de 63 caractères
 * de PostgreSQL, qui tronque en silence.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payouts', function (Blueprint $table) {
            $table->dateTime('bank_reconciled_at')->nullable()->after('processed_at');
            $table->unsignedBigInteger('bank_statement_line_id')->nullable()->after('bank_reconciled_at');
            $table->foreign('bank_statement_line_id', 'payouts_bank_line_fk')
                ->references('id')->on('bank_statement_lines')->nullOnDelete();
        });

        DB::statement('CREATE UNIQUE INDEX payouts_bank_line_unique ON payouts (bank_statement_line_id) WHERE bank_statement_line_id IS NOT NULL');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS payouts_bank_line_unique');

        Schema::table('payouts', function (Blueprint $table) {
            $table->dropForeign('payouts_bank_line_fk');
            $table->dropColumn(['bank_reconciled_at', 'bank_statement_line_id']);
        });
    }
};
