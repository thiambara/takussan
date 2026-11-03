<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2392 — ce que la collecte et la fusion ajoutent à une annonce.
 *
 * - `discovered_by_run_id` : le passage qui l'a trouvée (null : saisie par un opérateur).
 * - `merged_at` : posée par la fusion AUTOMATIQUE (l'annonce est `duplicate` d'une annonce d'un autre site) ; une fusion
 *   séparée la remet à null. `merge_checked_at` : la fusion a été jugée une fois — elle n'est plus retentée, séparée ou non.
 * - `similarity_text` : le texte comparé par le quatrième signal (`pg_trgm`) : description extraite, sinon texte brut,
 *   replié, SANS chiffres (aucun numéro), 1 000 caractères au plus. Purgé avec l'annonce. Index GIN `gin_trgm_ops`.
 *
 * `pg_trgm` est une extension de confiance (`trusted = true`) : le propriétaire de la base la crée sans superutilisateur.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        Schema::table('radar_listings', function (Blueprint $table) {
            $table->foreignId('discovered_by_run_id')->nullable()->constrained('radar_crawl_runs', 'id', 'radar_listings_run_fk')->nullOnDelete();
            $table->timestamp('merged_at')->nullable();
            $table->timestamp('merge_checked_at')->nullable();
            $table->text('similarity_text')->nullable();
            $table->index('discovered_by_run_id', 'radar_listings_run_idx');
        });
        DB::statement('CREATE INDEX radar_listings_similarity_trgm ON radar_listings USING gin (similarity_text gin_trgm_ops)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS radar_listings_similarity_trgm');
        Schema::table('radar_listings', function (Blueprint $table) {
            $table->dropForeign('radar_listings_run_fk');
            $table->dropIndex('radar_listings_run_idx');
            $table->dropColumn(['discovered_by_run_id', 'merged_at', 'merge_checked_at', 'similarity_text']);
        });
        DB::statement('DROP EXTENSION IF EXISTS pg_trgm');
    }
};
