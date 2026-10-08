<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-594 (ADR-0039 §2, §4) — le bénéficiaire explicite et les trois gestes d'une sortie d'argent.
 *
 * `payee_role` est une chaîne, pas un `enum()` (ADR-0007). Le CHECK « `lease_id` OU `booking_id` »
 * de models-spec §28 n'est PAS posé : un reversement couvre plusieurs baux d'un même bailleur, et
 * l'origine se garantit à l'écriture (au moins une pièce), les pivots la portant.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payouts', function (Blueprint $table) {
            $table->string('payee_role', 30)->default('landlord')->after('landlord_id');
            $table->foreignId('approved_by_id')->nullable()->after('issued_by_id')
                ->constrained('users', 'id', 'payouts_approved_by_fk')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approved_by_id');
            $table->foreignId('processed_by_id')->nullable()->after('approved_at')
                ->constrained('users', 'id', 'payouts_processed_by_fk')->nullOnDelete();
            $table->foreignId('payout_method_id')->nullable()->after('payment_method')
                ->constrained('payout_methods', 'id', 'payouts_payout_method_fk')->nullOnDelete();
            $table->foreignId('service_provider_bill_id')->nullable()->after('booking_id')
                ->constrained('service_provider_bills', 'id', 'payouts_sp_bill_fk')->nullOnDelete();

            $table->index(['agency_id', 'status'], 'payouts_agency_status_idx');
            $table->index('service_provider_bill_id', 'payouts_sp_bill_idx');
        });
    }

    public function down(): void
    {
        Schema::table('payouts', function (Blueprint $table) {
            $table->dropIndex('payouts_agency_status_idx');
            $table->dropIndex('payouts_sp_bill_idx');
            $table->dropForeign('payouts_approved_by_fk');
            $table->dropForeign('payouts_processed_by_fk');
            $table->dropForeign('payouts_payout_method_fk');
            $table->dropForeign('payouts_sp_bill_fk');
            $table->dropColumn([
                'payee_role', 'approved_by_id', 'approved_at', 'processed_by_id',
                'payout_method_id', 'service_provider_bill_id',
            ]);
        });
    }
};
