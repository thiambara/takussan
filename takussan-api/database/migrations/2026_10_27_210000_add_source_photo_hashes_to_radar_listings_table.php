<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2387 (ADR-0054, ADR-0077) — l'empreinte dHash des photos source, calculées à la volée ; la photo
 * n'est jamais conservée. `null` : pas encore calculé ; `[]` : calculé, aucune photo. Un élément par URL
 * tentée : `{url, hash, b0..b3}` en cas de réussite, `{url, hash: null, error}` sinon.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_listings', function (Blueprint $table) {
            $table->jsonb('source_photo_hashes')->nullable();
        });
        // Recherche des candidats par bande (exacte sous le seuil d'ADR-0054) : `@> '[{"b0": n}]'`.
        DB::statement('CREATE INDEX radar_listings_photo_hashes_gin ON radar_listings USING gin (source_photo_hashes jsonb_path_ops)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS radar_listings_photo_hashes_gin');
        Schema::table('radar_listings', fn (Blueprint $table) => $table->dropColumn('source_photo_hashes'));
    }
};
