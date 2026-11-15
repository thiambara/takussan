<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2520 (ADR-0092) — la place « Mise en avant » de l'annuaire public des agences.
 *
 * Au plus une place par ville et par instant, et c'est la BASE qui le garde : deux écritures
 * concurrentes qui lisent toutes deux « libre » ne passent pas. `btree_gist` permet `=` sur un
 * entier dans un index GiST ; c'est une extension de confiance (`trusted`) depuis PostgreSQL 13,
 * que le propriétaire de la base crée sans superutilisateur (même cas que `pg_trgm`, TCK-2392).
 *
 * `tsrange` et non `tstzrange` : les colonnes sont des `timestamp` sans fuseau, et `tstzrange()` sur
 * elles dépend du `TimeZone` de la session — PostgreSQL refuse une expression d'index non immuable.
 * La ville `null` (l'annuaire sans filtre) a sa propre contrainte, partielle : `=` ne joint pas deux
 * `NULL`, la première ne la verrait pas.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS btree_gist');

        Schema::create('agency_spotlights', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->foreignId('geo_city_id')->nullable()->constrained('geo_cities', 'id', 'agency_spotlights_city_fk')->nullOnDelete();
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->foreignId('granted_by_id')->nullable()->constrained('users', 'id', 'agency_spotlights_granted_by_fk')->nullOnDelete();
            $table->string('note', 255)->nullable();
            $table->timestamps();

            $table->index('agency_id');
            $table->index(['geo_city_id', 'starts_at'], 'agency_spotlights_city_start_idx');
        });

        DB::statement('ALTER TABLE agency_spotlights ADD CONSTRAINT agency_spotlights_period_check CHECK (ends_at > starts_at)');
        DB::statement('ALTER TABLE agency_spotlights ADD CONSTRAINT agency_spotlights_city_no_overlap EXCLUDE USING gist (geo_city_id WITH =, tsrange(starts_at, ends_at) WITH &&)');
        DB::statement('ALTER TABLE agency_spotlights ADD CONSTRAINT agency_spotlights_nocity_no_overlap EXCLUDE USING gist (tsrange(starts_at, ends_at) WITH &&) WHERE (geo_city_id IS NULL)');
    }

    public function down(): void
    {
        Schema::dropIfExists('agency_spotlights');
        DB::statement('DROP EXTENSION IF EXISTS btree_gist');
    }
};
