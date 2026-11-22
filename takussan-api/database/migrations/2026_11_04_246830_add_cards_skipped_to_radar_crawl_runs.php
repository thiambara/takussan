<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2468 (ADR-0087 §5) — les cartes qu'un passage d'une source ciblée a écartées : nouvelles, et ne pouvant
 * correspondre à aucune cible active. Aucune ligne n'est créée pour elles ; ce compteur est la seule trace.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_crawl_runs', function (Blueprint $table) {
            $table->unsignedInteger('cards_skipped')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('radar_crawl_runs', function (Blueprint $table) {
            $table->dropColumn('cards_skipped');
        });
    }
};
