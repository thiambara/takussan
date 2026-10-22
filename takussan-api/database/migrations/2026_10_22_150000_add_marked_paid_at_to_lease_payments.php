<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-1342 (P132.01) — le moment où l'agence a enregistré le paiement (`markPaid`), distinct de
 * `paid_at`, la date effective qu'elle saisit et qui peut être ancienne.
 *
 * La fenêtre de quittance du lien `/pay/{jeton}` court depuis le plus tardif des deux
 * (`LeasePaymentLinkService::effectiveExpiry`) : un loyer saisi après coup n'envoie plus un lien
 * mort à l'émission. Colonne additive et nullable : aucune ligne existante n'est réécrite.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lease_payments', function (Blueprint $table) {
            $table->timestamp('marked_paid_at')->nullable()->after('paid_at');
        });
    }

    public function down(): void
    {
        Schema::table('lease_payments', function (Blueprint $table) {
            $table->dropColumn('marked_paid_at');
        });
    }
};
