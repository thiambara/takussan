<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2472 (ADR-0088 §2) — la table de travail qui compte les visiteurs distincts d'une recherche, un jour donné.
 *
 * `visitor_hash` = `HMAC-SHA256(IP — /64 en IPv6 —, APP_KEY + jour)` : l'empreinte change chaque jour, elle ne rejoint
 * ni un autre jour, ni un compte. Effacée au-delà de 48 heures par `search:purge-journal`. Aucune IP en clair.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('search_query_visitors', function (Blueprint $table) {
            $table->date('day');
            $table->string('query_key', 64);
            $table->string('visitor_hash', 64);
            $table->timestamp('created_at')->useCurrent();

            // `insertOrIgnore` : seule la PREMIÈRE recherche d'un visiteur ce jour-là crée une ligne, et c'est elle qui
            // fait avancer `search_query_stats.distinct_visitors`.
            $table->unique(['day', 'query_key', 'visitor_hash'], 'search_query_visitors_unique');
            $table->index('created_at', 'search_query_visitors_created_at_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('search_query_visitors');
    }
};
