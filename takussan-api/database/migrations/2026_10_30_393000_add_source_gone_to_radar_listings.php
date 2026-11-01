<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2393 (ADR-0083 §3) — la disparition constatée d'une annonce collectée.
 *
 * - `source_gone_at` : la fin du passage qui l'a constatée — le dernier passage `finished` de son site dont
 *   `reached_end` est vrai, et qui ne l'a pas revue. Null : présente, ou jamais jugée. Remise à null quand un passage
 *   postérieur la revoit.
 * - `source_gone_run_id` : ce passage.
 *
 * Écrites par `radar:observe-sources` (`RadarSourceWatch`) ; lues par l'observatoire (temps de mise sur le marché). Deux
 * colonnes anonymes : la purge (TCK-2391) n'y touche pas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_listings', function (Blueprint $table) {
            $table->timestamp('source_gone_at')->nullable();
            $table->foreignId('source_gone_run_id')->nullable()->constrained('radar_crawl_runs', 'id', 'radar_listings_gone_run_fk')->nullOnDelete();
            $table->index('source_gone_at', 'radar_listings_source_gone_at_idx');
            $table->index('source_gone_run_id', 'radar_listings_gone_run_idx');
        });
    }

    public function down(): void
    {
        Schema::table('radar_listings', function (Blueprint $table) {
            $table->dropForeign('radar_listings_gone_run_fk');
            $table->dropIndex('radar_listings_gone_run_idx');
            $table->dropIndex('radar_listings_source_gone_at_idx');
            $table->dropColumn(['source_gone_at', 'source_gone_run_id']);
        });
    }
};
