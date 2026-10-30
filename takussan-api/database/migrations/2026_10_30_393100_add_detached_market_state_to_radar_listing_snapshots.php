<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2393 (ADR-0083 §2) — l'état de marché qu'un instantané DÉTACHÉ par la purge (TCK-2392) garde de son annonce : la
 * disparition constatée (`detached_gone_at`) et le rattachement au catalogue (`detached_in_catalog`, doublon d'un bien).
 * Sans eux, une annonce purgée changerait de case dans l'observatoire (en ligne, hors catalogue) au moment où elle perd
 * son lien. Ni l'un ni l'autre ne dit qui elle était. Nuls ou faux sur un instantané encore attaché : l'annonce le dit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_listing_snapshots', function (Blueprint $table) {
            $table->timestamp('detached_gone_at')->nullable();
            $table->boolean('detached_in_catalog')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('radar_listing_snapshots', function (Blueprint $table) {
            $table->dropColumn(['detached_gone_at', 'detached_in_catalog']);
        });
    }
};
