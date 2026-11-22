<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2793 (ADR-0039, amendement du 2026-11-14) — la pénalité de retard payée SEULE en ligne
 * (TCK-2778) a sa propre comptabilité sur la ligne d'échéance :
 *
 * - `late_fee_platform_payout_id` — le `PlatformPayout` qui l'a prise quand la plateforme l'a
 *   encaissée (son éligibilité propre à la clôture, point 3) ;
 * - `late_fee_bank_reconciled_at`, `late_fee_bank_statement_line_id` — son rapprochement quand
 *   l'agence l'a encaissée, à côté de celui du loyer (point 5) ;
 * - `bank_statement_lines.matched_part` — la part de l'échéance que la ligne de relevé désigne
 *   (`late_fee`, nulle pour tout le reste). Chaîne sans `enum()` SQL (ADR-0007).
 *
 * Additive et nullable : aucune reprise de données.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lease_payments', function (Blueprint $table): void {
            $table->foreignId('late_fee_platform_payout_id')->nullable()
                ->constrained('platform_payouts', 'id', 'lease_payments_late_fee_platform_payout_fk')->nullOnDelete();
            $table->index('late_fee_platform_payout_id', 'lease_payments_late_fee_platform_payout_idx');
            $table->dateTime('late_fee_bank_reconciled_at')->nullable();
            $table->unsignedBigInteger('late_fee_bank_statement_line_id')->nullable();
            $table->foreign('late_fee_bank_statement_line_id', 'lease_payments_late_fee_bank_line_fk')
                ->references('id')->on('bank_statement_lines')->nullOnDelete();
        });

        // Une ligne de relevé ne rapproche qu'une pénalité : l'index partiel, comme celui du loyer.
        DB::statement('CREATE UNIQUE INDEX lease_payments_late_fee_bank_line_unique ON lease_payments (late_fee_bank_statement_line_id) WHERE late_fee_bank_statement_line_id IS NOT NULL');

        Schema::table('bank_statement_lines', function (Blueprint $table): void {
            $table->string('matched_part', 16)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('bank_statement_lines', function (Blueprint $table): void {
            $table->dropColumn('matched_part');
        });

        DB::statement('DROP INDEX IF EXISTS lease_payments_late_fee_bank_line_unique');

        Schema::table('lease_payments', function (Blueprint $table): void {
            $table->dropForeign('lease_payments_late_fee_bank_line_fk');
            $table->dropForeign('lease_payments_late_fee_platform_payout_fk');
            $table->dropIndex('lease_payments_late_fee_platform_payout_idx');
            $table->dropColumn([
                'late_fee_platform_payout_id',
                'late_fee_bank_reconciled_at',
                'late_fee_bank_statement_line_id',
            ]);
        });
    }
};
