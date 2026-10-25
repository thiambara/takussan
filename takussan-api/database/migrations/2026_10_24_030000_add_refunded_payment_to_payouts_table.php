<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2052 (P110.01, ADR-0039 amendement du 2026-10-23, point 8) — le `Payout` « constaté » d'un
 * remboursement d'acompte ou de loyer déjà sorti désigne le payable remboursé. Ces deux colonnes en
 * sont à la fois la marque et le lien : un constaté est exactement un `Payout` où elles sont non
 * nulles. Additive : nulles pour tout `Payout` existant, sans reprise de données.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payouts', function (Blueprint $table) {
            $table->nullableMorphs('refunded_payment', 'payouts_refunded_payment_idx');
        });
    }

    public function down(): void
    {
        Schema::table('payouts', function (Blueprint $table) {
            $table->dropIndex('payouts_refunded_payment_idx');
            $table->dropColumn(['refunded_payment_type', 'refunded_payment_id']);
        });
    }
};
