<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2472 (ADR-0088 §1) — le journal anonyme et agrégé des recherches publiques : une ligne par jour et par recherche,
 * rien par personne. Écrit par `App\Services\Search\SearchJournal`, purgé à 13 mois par `search:purge-journal`.
 *
 * - `query_key` : `sha256` de la saisie normalisée et de la signature des critères — la clé d'agrégation.
 * - `normalized_query` : la saisie en minuscules, sans accents, blancs repliés (au plus 80 caractères : une saisie plus
 *   longue n'est jamais journalisée, ADR-0088 §3). Nulle pour une recherche par critères seuls.
 * - `criteria` : les critères structurés, clés = paramètres publics de `/properties` (ni coordonnées, ni date).
 * - `distinct_visitors` : visiteurs distincts du JOUR, comptés par `search_query_visitors` ; rien au-delà du jour.
 *
 * Ni compte, ni IP, ni identifiant durable.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('search_query_stats', function (Blueprint $table) {
            $table->id();
            $table->date('day');
            $table->string('query_key', 64);
            $table->string('normalized_query', 80)->nullable();
            $table->jsonb('criteria');
            $table->unsignedInteger('searches_count')->default(0);
            $table->unsignedInteger('distinct_visitors')->default(0);
            $table->unsignedInteger('zero_results_count')->default(0);
            $table->unsignedInteger('last_results_count')->default(0);
            $table->timestamps();

            // L'écriture concurrente : `upsert` sur ce couple, incréments atomiques (`ON CONFLICT DO UPDATE`).
            $table->unique(['day', 'query_key'], 'search_query_stats_day_query_key_unique');
            // `popular()` : le préfixe de la saisie (collation `C`, l'index sert un `LIKE 'x%'`).
            $table->index('normalized_query', 'search_query_stats_normalized_query_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('search_query_stats');
    }
};
