<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 (ADR-0062 §4) — une adresse RÉFÉRENCE sa ville et son quartier, et garde ses textes.
 *
 * Les colonnes texte (`city`, `region`, `neighborhood`) restent la vérité affichée et indexée par
 * la recherche : les identifiants ne remplacent rien, ils canonisent (`GeoAddressCanonicalizer`).
 * `nullOnDelete` : une ligne de référentiel supprimée ne doit jamais emporter une adresse.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('addresses', function (Blueprint $table) {
            $table->foreignId('geo_city_id')->nullable()
                ->constrained('geo_cities', 'id', 'addresses_geo_city_fk')
                ->nullOnDelete();
            $table->foreignId('geo_neighborhood_id')->nullable()
                ->constrained('geo_neighborhoods', 'id', 'addresses_geo_neighborhood_fk')
                ->nullOnDelete();
            $table->index('geo_city_id', 'addresses_geo_city_idx');
            $table->index('geo_neighborhood_id', 'addresses_geo_neighborhood_idx');
        });
    }

    public function down(): void
    {
        Schema::table('addresses', function (Blueprint $table) {
            $table->dropForeign('addresses_geo_neighborhood_fk');
            $table->dropForeign('addresses_geo_city_fk');
            $table->dropIndex('addresses_geo_neighborhood_idx');
            $table->dropIndex('addresses_geo_city_idx');
            $table->dropColumn(['geo_neighborhood_id', 'geo_city_id']);
        });
    }
};
