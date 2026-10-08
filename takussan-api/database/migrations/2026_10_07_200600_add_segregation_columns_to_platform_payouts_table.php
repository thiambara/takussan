<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-594 (ADR-0039 §4) — les trois gestes du reversement plateforme deviennent des colonnes.
 *
 * L'auteur de la clôture ne vivait que dans `activity_log`, le payeur nulle part, et la référence du
 * virement dans un `metadata.bank_ref` facultatif : rien ne permettait de comparer les acteurs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('platform_payouts', function (Blueprint $table) {
            $table->foreignId('closed_by_id')->nullable()->after('status')
                ->constrained('users', 'id', 'platform_payouts_closed_by_fk')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->foreignId('paid_by_id')->nullable()->after('approved_at')
                ->constrained('users', 'id', 'platform_payouts_paid_by_fk')->nullOnDelete();
            $table->string('payment_reference')->nullable()->after('processed_at');
        });
    }

    public function down(): void
    {
        Schema::table('platform_payouts', function (Blueprint $table) {
            $table->dropForeign('platform_payouts_closed_by_fk');
            $table->dropForeign('platform_payouts_paid_by_fk');
            $table->dropColumn(['closed_by_id', 'approved_at', 'paid_by_id', 'payment_reference']);
        });
    }
};
