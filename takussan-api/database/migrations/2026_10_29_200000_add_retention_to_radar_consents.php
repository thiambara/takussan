<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2391 (ADR-0077 §9) — la rétention de la preuve d'un accord confirmé : « tant que les annonces concernées sont en
 * ligne, puis 3 ans » (`privacy.ts` § 6). Le retrait d'un bien n'a pas de date en base (l'annonceur archive, le bien est
 * supprimé, l'agence est suspendue) : `offline_since` la porte, posée par `radar:purge` à la première observation « plus
 * rien en ligne » (le jour de la révocation s'il y en a une) et remise à null si un bien revient en ligne.
 * `purged_at` : la preuve a été effacée (transcription, verdict, captures) ; la ligne reste, avec les empreintes des
 * captures, le statut et les dates.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_consents', function (Blueprint $table) {
            $table->timestamp('offline_since')->nullable();
            $table->timestamp('purged_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('radar_consents', fn (Blueprint $table) => $table->dropColumn(['offline_since', 'purged_at']));
    }
};
