<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2467 (ADR-0087 §4) — la date de modification que le sitemap du site donnait à l'annonce (`<lastmod>`) lors de sa
 * dernière lecture : un `lastmod` plus récent fait relire la page (`RefreshRadarListing`), sans IA. Nulle pour une
 * annonce jamais vue dans un sitemap (saisie à la main, ou par les listes).
 *
 * `timestamp` et non `timestamptz` : c'est le type de toutes les dates du dépôt, écrites et relues en UTC par
 * l'application ; un `timestamptz` se lirait dans le fuseau de la session PostgreSQL, que la connexion ne fixe pas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_listings', function (Blueprint $table) {
            $table->timestamp('source_lastmod')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('radar_listings', function (Blueprint $table) {
            $table->dropColumn('source_lastmod');
        });
    }
};
