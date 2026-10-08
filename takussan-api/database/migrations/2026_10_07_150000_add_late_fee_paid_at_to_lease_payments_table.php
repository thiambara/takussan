<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-593 — la pénalité de retard est réglée.
 *
 * `status` décrit le LOYER : rien n'enregistrait jusqu'ici qu'une pénalité avait été réglée, ni en
 * colonne ni en métadonnée, si bien qu'un loyer soldé faisait disparaître la pénalité de tous les
 * écrans. `late_fee_outstanding` se dérive de cette colonne (`LeasePayment::lateFeeOutstanding()`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lease_payments', function (Blueprint $table) {
            $table->dateTime('late_fee_paid_at')->nullable()->after('late_fee_applied_at');
        });
    }

    public function down(): void
    {
        Schema::table('lease_payments', function (Blueprint $table) {
            $table->dropColumn('late_fee_paid_at');
        });
    }
};
