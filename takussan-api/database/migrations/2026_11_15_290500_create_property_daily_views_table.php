<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2905 (ADR-0117) — les vues d'un bien, par jour : (bien, jour, nombre). Aucune adresse IP ni
 * identifiant de visiteur — la déduplication reste celle du limiteur de `PropertyViewCounter`, en cache.
 * Écrite par `PropertyViewCounter::record()` (upsert sur `(property_id, day)`), lue par `include=stats30d`
 * de la liste agence, purgée au-delà de 400 jours (`properties:purge-daily-views`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('property_daily_views', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained('properties')->cascadeOnDelete();
            $table->date('day');
            $table->unsignedInteger('views')->default(0);
            $table->timestamps();

            // L'upsert du compteur s'y appuie (`ON CONFLICT`), et la lecture par bien et fenêtre aussi.
            $table->unique(['property_id', 'day']);
            $table->index('day');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('property_daily_views');
    }
};
