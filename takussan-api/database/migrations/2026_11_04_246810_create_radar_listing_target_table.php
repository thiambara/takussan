<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2468 (ADR-0087 §5) — les annonces extraites qui remplissent les critères d'une cible. Une ligne se pose après
 * l'extraction (et à la relecture validée) par `App\Services\Radar\Targets\RadarTargetLinker`. Une annonce ne s'efface
 * jamais (la purge vide ses champs) ; une cible non plus (elle se retire) : les clés étrangères en cascade ne servent
 * qu'à un nettoyage manuel.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('radar_listing_target', function (Blueprint $table) {
            $table->foreignId('radar_listing_id')->constrained('radar_listings', 'id', 'radar_listing_target_listing_fk')->cascadeOnDelete();
            $table->foreignId('radar_target_id')->constrained('radar_targets', 'id', 'radar_listing_target_target_fk')->cascadeOnDelete();
            $table->timestamp('matched_at');
            $table->primary(['radar_listing_id', 'radar_target_id'], 'radar_listing_target_pk');
            $table->index(['radar_target_id', 'matched_at'], 'radar_listing_target_target_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('radar_listing_target');
    }
};
