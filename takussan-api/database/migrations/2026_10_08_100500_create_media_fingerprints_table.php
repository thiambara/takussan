<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-597 (ADR-0054 §1, §2) — l'empreinte dHash de la photo ORIGINALE d'un bien.
 *
 * `hash` porte les 64 bits (signés, `bigint`) ; `band_0` … `band_3` leurs quatre tranches de 16 bits,
 * chacune indexée : deux empreintes à distance de Hamming ≤ 3 partagent au moins une bande, la
 * recherche de candidats est donc une égalité indexée. Noms explicites (troncature à 63 caractères).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('media_fingerprints', function (Blueprint $table) {
            $table->id();
            $table->foreignId('media_id')->constrained('media', 'id', 'media_fingerprints_media_fk')->cascadeOnDelete();
            $table->foreignId('property_id')->constrained('properties', 'id', 'media_fingerprints_property_fk')->cascadeOnDelete();
            $table->foreignId('agency_id')->nullable()->constrained('agencies', 'id', 'media_fingerprints_agency_fk')->nullOnDelete();
            $table->bigInteger('hash');
            $table->integer('band_0');
            $table->integer('band_1');
            $table->integer('band_2');
            $table->integer('band_3');
            $table->timestamps();

            $table->unique('media_id', 'media_fingerprints_media_uniq');
            $table->index('property_id', 'media_fingerprints_property_idx');
            // TCK-343 — toute colonne `agency_id` porte un index : PostgreSQL n'en pose aucun sous une FK.
            $table->index('agency_id', 'media_fingerprints_agency_idx');
            $table->index('band_0', 'media_fingerprints_band_0_idx');
            $table->index('band_1', 'media_fingerprints_band_1_idx');
            $table->index('band_2', 'media_fingerprints_band_2_idx');
            $table->index('band_3', 'media_fingerprints_band_3_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media_fingerprints');
    }
};
