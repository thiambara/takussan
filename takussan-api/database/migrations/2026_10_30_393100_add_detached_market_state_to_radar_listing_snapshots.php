<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2393 (ADR-0083 §2) — l'état de marché qu'un instantané DÉTACHÉ par la purge des 90 jours (TCK-2392) garde de son
 * annonce : la disparition constatée, AU JOUR (`detached_gone_at`), le rattachement au catalogue (`detached_in_catalog`,
 * doublon d'un bien) et le site seul (`detached_source_site` : la purge efface le passage, qui portait le site ET l'heure).
 * Sans eux, une annonce purgée changerait de case dans l'observatoire au moment où elle perd son lien. Aucun ne relie la
 * ligne à sa fiche ni à son annonceur ; une purge pour STOP supprime les instantanés, ces colonnes comprises. Nuls ou faux
 * sur un instantané encore attaché : l'annonce le dit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_listing_snapshots', function (Blueprint $table) {
            $table->timestamp('detached_gone_at')->nullable();
            $table->boolean('detached_in_catalog')->default(false);
            $table->string('detached_source_site', 40)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('radar_listing_snapshots', function (Blueprint $table) {
            $table->dropColumn(['detached_gone_at', 'detached_in_catalog', 'detached_source_site']);
        });
    }
};
