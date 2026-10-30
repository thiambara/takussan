<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2438 (ADR-0080, amendement du 2026-10-30) — les URL de départ de la collecte se règlent dans la console.
 *
 * `radar_crawl_sources.start_urls` : les pages de liste qu'un passage lit sur ce site, dans l'ordre. Nulle (jamais une
 * liste vide) : l'URL de `config('radar.crawl.sites.<site>.start_url')`, comme avant ce ticket.
 *
 * `radar_crawl_runs.start_urls` : celles qu'un passage a lues, nulle s'il a lu l'URL de la configuration. La veille de
 * l'observatoire (`RadarSourceWatch`) ne compte un passage complet contre une annonce que s'il a lu les mêmes listes que
 * le passage qui l'a vue en dernier : restreindre les URL de départ ne fait disparaître aucune annonce.
 *
 * Les deux colonnes naissent nulles : les sources et les passages existants gardent le sens qu'ils avaient.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_crawl_sources', function (Blueprint $table) {
            $table->jsonb('start_urls')->nullable();
        });
        Schema::table('radar_crawl_runs', function (Blueprint $table) {
            $table->jsonb('start_urls')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('radar_crawl_runs', function (Blueprint $table) {
            $table->dropColumn('start_urls');
        });
        Schema::table('radar_crawl_sources', function (Blueprint $table) {
            $table->dropColumn('start_urls');
        });
    }
};
