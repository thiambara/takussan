<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2326 (P203.05) — une tentative de remise garde l'agence de l'envoi (celle dont le canal a
 * cherché l'intégration, P203.01) et l'intégration que le fournisseur a prise, celle de l'agence ou
 * celle de la plateforme. Avant, seuls deux `Log::warning` du routeur SMS citaient l'agence, et
 * l'intégration ne se lisait nulle part : `cost_estimate` ne disait pas qui paie le SMS.
 *
 * Nullables toutes deux, et les lignes existantes restent à `null` : ni l'agence ni l'intégration
 * d'un envoi passé ne se reconstituent sans deviner (décision du porteur). `nullOnDelete` : une
 * tentative survit à la suppression de son agence ou de son intégration, comme la trace qu'elle est.
 *
 * Le `down()` retire les deux clés étrangères puis les deux colonnes ; ce qu'elles portaient se perd.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_delivery_attempts', function (Blueprint $table) {
            $table->foreignId('agency_id')->nullable()
                ->constrained('agencies')->nullOnDelete();
            $table->foreignId('integration_id')->nullable()
                ->constrained('integrations')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('notification_delivery_attempts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('integration_id');
            $table->dropConstrainedForeignId('agency_id');
        });
    }
};
