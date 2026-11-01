<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2444 — le code de Meta d'un message du Radar non remis (`provider_status = failed`), écrit par
 * `RadarWhatsappReceipts` avec ce statut : le code seul, jamais le texte de l'erreur (il peut citer le numéro). La fiche
 * annonceur en dérive le motif. Les échecs reçus avant cette migration gardent leur code au seul journal d'activité.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_outreaches', function (Blueprint $table) {
            $table->integer('provider_error_code')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('radar_outreaches', function (Blueprint $table) {
            $table->dropColumn('provider_error_code');
        });
    }
};
