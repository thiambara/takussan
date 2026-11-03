<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2389 (ADR-0077 §6) — la réserve de photos d'une annonce-URL, remplie APRÈS l'accord confirmé.
 * `null` : jamais préparée ; `[]` : préparée, aucune URL à tenter. Un élément par URL tentée, dans l'ordre
 * de `photo_urls` : `{url, media_id}` en cas de réussite (le média est dans la collection `radar_photos`),
 * `{url, media_id: null, error}` sinon. `media_id` peut désigner un média retiré depuis (l'opérateur retire une photo lue : l'URL
 * reste « tentée » et n'est pas relue) : tout consommateur le relit dans `radar_photos`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_listings', function (Blueprint $table) {
            $table->jsonb('photo_preparation')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('radar_listings', fn (Blueprint $table) => $table->dropColumn('photo_preparation'));
    }
};
