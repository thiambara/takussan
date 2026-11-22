<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2467 (ADR-0087 §4) — comment une source découvre ses annonces : `sitemap` ou `lists`
 * (`App\Models\Enums\RadarCrawlDiscovery`). Nulle tant que la console ne l'a pas réglée : la source suit alors le défaut
 * de son adaptateur — `sitemap` quand il en déclare, `lists` sinon. Le défaut dépend du code de l'adaptateur, pas de la
 * base : une colonne nulle plutôt qu'une valeur recopiée ici. Les lignes existantes restent nulles, donc Expat-Dakar passe
 * au sitemap au déploiement et CoinAfrique garde ses listes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_crawl_sources', function (Blueprint $table) {
            $table->string('discovery', 20)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('radar_crawl_sources', function (Blueprint $table) {
            $table->dropColumn('discovery');
        });
    }
};
