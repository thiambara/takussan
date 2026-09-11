<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-508 — l'état déclaré d'un bien (`App\Models\Enums\PropertyCondition`).
 *
 * `string` et non `enum()` (ADR-0007) : la liste se fait évoluer dans l'enum PHP,
 * sans `ALTER TYPE`. Nullable, et sans remplissage : « non renseigné » est un état
 * légitime, et la recherche retombe alors sur `year_built` (TCK-506).
 *
 * Pas d'index : le filtre public passe par Meilisearch, et celui du tableau de bord
 * est déjà borné par l'agence. On indexe sur mesure, pas par principe (CLAUDE.md).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table): void {
            $table->string('condition', 20)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table): void {
            $table->dropColumn('condition');
        });
    }
};
