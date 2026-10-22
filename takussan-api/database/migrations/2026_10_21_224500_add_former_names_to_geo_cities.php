<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-1169 (P99.01) — les anciens noms d'une ville que le jeu du référentiel renomme, comme ceux
 * des quartiers (TCK-1080).
 *
 * `GeoReferentialLoader::ville()` les y ajoute ; `VilleDuFiltre` les lit, pour le filtre `city` /
 * `cities` de la recherche et des alertes, et pour le rapprochement CRM : un critère rangé sous
 * l'ancien nom désigne toujours la ville. Colonne additive et nullable : aucune ligne existante
 * n'est réécrite.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('geo_cities', function (Blueprint $table) {
            $table->jsonb('former_names')->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('geo_cities', function (Blueprint $table) {
            $table->dropColumn('former_names');
        });
    }
};
