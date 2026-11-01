<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2388 (ADR-0077 §3) — les annonces qu'un message de démarchage couvre.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('radar_outreach_listing', function (Blueprint $table) {
            // Un message préparé puis remplacé (jamais envoyé) s'efface avec ses lignes ; une annonce ne s'efface
            // jamais (la purge vide ses champs, TCK-2391).
            $table->foreignId('radar_outreach_id')->constrained('radar_outreaches', 'id', 'radar_outreach_listing_outreach_fk')->cascadeOnDelete();
            $table->foreignId('radar_listing_id')->constrained('radar_listings', 'id', 'radar_outreach_listing_listing_fk')->restrictOnDelete();
            $table->primary(['radar_outreach_id', 'radar_listing_id'], 'radar_outreach_listing_pk');
            $table->index('radar_listing_id', 'radar_outreach_listing_listing_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('radar_outreach_listing');
    }
};
