<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2518 — ce que l'annuaire public dit d'une agence et d'un agent, au-delà du portefeuille.
 *
 * Agence : l'accroche, « Pourquoi nous » (trois chaînes), la sélection de la fiche (six biens de
 * l'agence au plus, dans l'ordre choisi) et le délai de réponse habituel. Agent : ses langues
 * (codes de `directory.languages`), ses quartiers (identifiants de `geo_neighborhoods`, cinq au
 * plus) et son délai de réponse.
 *
 * Toutes facultatives : la fiche se passe de ce qui manque. Les deux `median_response_minutes`
 * n'ont qu'un écrivain, le job nocturne `RefreshDirectoryResponseTimes` — elles ne sont dans aucun
 * `$fillable`. `neighborhood_ids` et `showcase_property_ids` sont des listes ORDONNÉES d'au plus
 * six identifiants : une table de liaison n'apporterait qu'une jointure à une lecture publique, et
 * un identifiant devenu invalide est sauté à la lecture, jamais émis.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->string('tagline', 120)->nullable();
            $table->jsonb('highlights')->nullable();
            $table->jsonb('showcase_property_ids')->nullable();
            $table->integer('median_response_minutes')->nullable();
        });

        Schema::table('agent_profiles', function (Blueprint $table) {
            $table->jsonb('languages')->nullable();
            $table->jsonb('neighborhood_ids')->nullable();
            $table->integer('median_response_minutes')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('agent_profiles', function (Blueprint $table) {
            $table->dropColumn(['languages', 'neighborhood_ids', 'median_response_minutes']);
        });

        Schema::table('agencies', function (Blueprint $table) {
            $table->dropColumn(['tagline', 'highlights', 'showcase_property_ids', 'median_response_minutes']);
        });
    }
};
