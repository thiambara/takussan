<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-1421 (P141.02) — le virement de clôture de la plateforme se rapproche d'un crédit du relevé
 * de l'agence, comme un reversement de l'agence d'un débit.
 *
 * Mêmes colonnes que `payouts` (`2026_10_07_150200`). L'index unique PARTIEL garantit qu'un
 * reversement de la plateforme n'est rapproché qu'à une seule ligne de relevé. Noms explicites :
 * PostgreSQL tronque en silence un nom de plus de 63 caractères.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('platform_payouts', function (Blueprint $table) {
            $table->dateTime('bank_reconciled_at')->nullable()->after('processed_at');
            $table->unsignedBigInteger('bank_statement_line_id')->nullable()->after('bank_reconciled_at');
            $table->foreign('bank_statement_line_id', 'platform_payouts_bank_line_fk')
                ->references('id')->on('bank_statement_lines')->nullOnDelete();
        });

        DB::statement('CREATE UNIQUE INDEX platform_payouts_bank_line_unique ON platform_payouts (bank_statement_line_id) WHERE bank_statement_line_id IS NOT NULL');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS platform_payouts_bank_line_unique');

        Schema::table('platform_payouts', function (Blueprint $table) {
            $table->dropForeign('platform_payouts_bank_line_fk');
            $table->dropColumn(['bank_reconciled_at', 'bank_statement_line_id']);
        });
    }
};
