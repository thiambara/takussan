<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2909 — la nature d'un reversement (`PayoutNature`), écrite à sa
 * création et jamais recalculée : un acompte reste un acompte quand un reversement suivant solde
 * le bailleur.
 *
 * L'existant ne reçoit que ce que ses colonnes disent déjà : un remboursement constaté
 * (`refunded_payment_id`), une restitution au locataire (`payee_role = tenant`), une facture de
 * prestataire (`payee_role = service_provider`). Un reversement au bailleur antérieur reste `null` :
 * qu'il ait été acompte ou solde ne se relit nulle part.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payouts', function (Blueprint $table): void {
            $table->string('nature', 32)->nullable()->after('payee_role');
        });

        DB::table('payouts')->whereNotNull('refunded_payment_id')->update(['nature' => 'refund']);
        DB::table('payouts')->whereNull('refunded_payment_id')->where('payee_role', 'tenant')->update(['nature' => 'deposit_refund']);
        DB::table('payouts')->where('payee_role', 'service_provider')->update(['nature' => 'provider_bill']);
    }

    public function down(): void
    {
        Schema::table('payouts', function (Blueprint $table): void {
            $table->dropColumn('nature');
        });
    }
};
