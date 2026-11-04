<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2468 (ADR-0087 §5) — la portée d'une source : `targeted` (le défaut) ne saisit une annonce nouvelle que si sa carte
 * peut correspondre à une cible active ; `all` garde le comportement d'ADR-0080 (tout ce qui est vu est saisi). Les lignes
 * existantes passent `targeted` : c'est la décision de l'ADR, et une source allumée sans cible ne saisit plus rien
 * (`radar.crawl.no_target`) tant que l'opérateur ne la règle pas sur `all` ou ne crée pas de cible.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_crawl_sources', function (Blueprint $table) {
            $table->string('scope', 20)->default('targeted');
        });
    }

    public function down(): void
    {
        Schema::table('radar_crawl_sources', function (Blueprint $table) {
            $table->dropColumn('scope');
        });
    }
};
