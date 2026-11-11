<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2661 (ADR-0049 §3) — la preuve d'un paiement de commission (moyen, référence) et le motif
 * d'une annulation, lisible du bénéficiaire. Tous nullables : les lignes déjà soldées n'en ont pas,
 * et une ligne due n'en porte aucun. Chaînes, jamais `enum()` SQL (ADR-0007) ; les longueurs sont
 * celles des `FormRequest` (`payment_reference` ≤ 100, `cancel_reason` ≤ 500).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('commission_entries', function (Blueprint $table) {
            $table->string('payment_method', 20)->nullable()->after('paid_by_id');
            $table->string('payment_reference', 100)->nullable()->after('payment_method');
            $table->string('cancel_reason_code', 40)->nullable()->after('cancelled_by_id');
            $table->string('cancel_reason', 500)->nullable()->after('cancel_reason_code');
        });
    }

    public function down(): void
    {
        Schema::table('commission_entries', function (Blueprint $table) {
            $table->dropColumn(['payment_method', 'payment_reference', 'cancel_reason_code', 'cancel_reason']);
        });
    }
};
