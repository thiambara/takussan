<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-1080 (P67.02) — les anciens noms d'un quartier renommé en modération.
 *
 * `GeoNeighborhoodModeration::renommer()` les y ajoute ; `QuartierDuFiltre::idsDuReferentiel()`
 * les lit : une recherche sauvegardée sur l'ancien nom continue de désigner le quartier (décision
 * du porteur). Colonne additive et nullable : aucune ligne existante n'est réécrite.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('geo_neighborhoods', function (Blueprint $table) {
            $table->jsonb('former_names')->nullable()->after('renamed_at');
        });
    }

    public function down(): void
    {
        Schema::table('geo_neighborhoods', function (Blueprint $table) {
            $table->dropColumn('former_names');
        });
    }
};
