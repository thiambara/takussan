<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-873 (P39.03) — le montant remboursé d'une échéance, comme `booking_payments.refund_amount` :
 * `HasPaymentAttributes::paidAmount()` en déduit le reçu d'une ligne `refunded`. Sans la colonne,
 * une échéance remboursée comptait son montant entier comme encaissé.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lease_payments', function (Blueprint $table) {
            $table->decimal('refund_amount', 14, 2)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('lease_payments', function (Blueprint $table) {
            $table->dropColumn('refund_amount');
        });
    }
};
