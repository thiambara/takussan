<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * P206.04 (ADR-0039, amendement du 2026-10-24, point 7) — la part de pénalité de retard rendue par un
 * remboursement, qui s'impute d'abord à elle. Une colonne et non `metadata` : le calculateur des
 * reversements, l'*Encaissé* et la clôture plateforme l'agrègent en SQL. `refund_amount` reste
 * plafonné au loyer.
 *
 * Additive et nullable : aucune reprise de données.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lease_payments', function (Blueprint $table): void {
            $table->decimal('late_fee_refund_amount', 14, 2)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('lease_payments', function (Blueprint $table): void {
            $table->dropColumn('late_fee_refund_amount');
        });
    }
};
