<?php

use App\Support\CaseInsensitive;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 (ADR-0062) — le référentiel géographique du Sénégal : région → ville → quartier.
 *
 * Les lignes viennent d'un jeu de données VERSIONNÉ (`database/data/geo/regions/*.json`), chargé
 * par `geo:sync-referential` au déploiement et par `GeoReferentialSeeder` en développement. Cette
 * migration ne charge rien : une migration qui insère casserait toute suite qui compte des lignes
 * (cf. « Écarts relevés », E-2).
 *
 * Unicité : un nom par ville, CASSE repliée par ICU (ADR-0025) — `CaseInsensitive::sql()` rend
 * l'expression exacte que les requêtes de `GeoNeighborhoodResolver` écrivent, sans quoi elles
 * n'emprunteraient pas l'index. L'index des quartiers est PARTIEL : un quartier refusé ou fusionné
 * ne réserve plus son nom.
 *
 * Noms d'index et de clés explicites : PostgreSQL TRONQUE un nom de plus de 63 caractères sans
 * erreur (CLAUDE.md, piège n°3).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('geo_regions', function (Blueprint $table) {
            $table->id();
            $table->string('code', 8)->unique('geo_regions_code_unique');
            $table->string('slug', 80)->unique('geo_regions_slug_unique');
            $table->string('name', 120);
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->timestamps();
        });

        Schema::create('geo_cities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('geo_region_id')
                ->constrained('geo_regions', 'id', 'geo_cities_region_fk')
                ->restrictOnDelete();
            $table->string('slug', 120);
            $table->string('name', 120);
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->timestamps();
            $table->unique(['geo_region_id', 'slug'], 'geo_cities_region_slug_unique');
        });

        Schema::create('geo_neighborhoods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('geo_city_id')
                ->constrained('geo_cities', 'id', 'geo_neighborhoods_city_fk')
                ->restrictOnDelete();
            $table->string('slug', 140);
            $table->string('name', 120);
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            // ADR-0007 : pas d'enum() SQL — une chaîne et `ReferentialStatus` côté application.
            $table->string('status', 16)->default('approved');
            $table->string('origin', 16)->default('dataset');
            $table->string('osm_ref', 32)->nullable();
            $table->foreignId('created_by_id')->nullable()
                ->constrained('users', 'id', 'geo_neighborhoods_created_by_fk')
                ->nullOnDelete();
            $table->foreignId('merged_into_id')->nullable()
                ->constrained('geo_neighborhoods', 'id', 'geo_neighborhoods_merged_into_fk')
                ->nullOnDelete();
            // Posé par un renommage en modération : le rechargement du jeu de données ne réécrit
            // plus ce nom (la décision humaine l'emporte sur l'extraction suivante).
            $table->timestamp('renamed_at')->nullable();
            $table->timestamps();
            $table->unique(['geo_city_id', 'slug'], 'geo_neighborhoods_city_slug_unique');
            // CLAUDE.md, piège n°8 : une FK n'est pas indexée d'office sous PostgreSQL.
            $table->index(['status', 'geo_city_id'], 'geo_neighborhoods_status_city_idx');
            $table->index('created_by_id', 'geo_neighborhoods_created_by_idx');
            $table->index('merged_into_id', 'geo_neighborhoods_merged_into_idx');
        });

        $nom = CaseInsensitive::sql('name');

        DB::statement("CREATE UNIQUE INDEX geo_cities_region_name_ci_unique ON geo_cities (geo_region_id, {$nom})");
        // Une ville se cherche par son nom dans TOUT le pays (rattachement des adresses existantes).
        DB::statement("CREATE INDEX geo_cities_name_ci_idx ON geo_cities ({$nom})");
        DB::statement(
            "CREATE UNIQUE INDEX geo_neighborhoods_city_name_ci_unique ON geo_neighborhoods (geo_city_id, {$nom}) "
            ."WHERE status <> 'rejected' AND merged_into_id IS NULL"
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('geo_neighborhoods');
        Schema::dropIfExists('geo_cities');
        Schema::dropIfExists('geo_regions');
    }
};
