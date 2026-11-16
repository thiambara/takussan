<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2866 (ADR-0115) — le fichier gardé d'un export (`GET /api/export/{entity}`), pour
 * « Retélécharger » : les octets servis, écrits sur le disque privé, `exports.retention_days` jours.
 *
 * - `activity_id` : la ligne du journal `export` / `data_exported` que « Mes derniers exports » relit
 *   (une par export : unique) ;
 * - `user_id` : l'auteur, seul à pouvoir le retélécharger ; `agency_id` : son agence active au moment
 *   de l'export (re-jugée au retéléchargement) ;
 * - `own_lines_only` : le fichier ne porte que les lignes propres du bénéficiaire (TCK-2661) ;
 * - `disk` et `path` ne sortent jamais de l'API ; `path` est chiffré (cast `encrypted`, d'où `text`).
 *
 * La purge `exports:purge-files` efface le fichier et la ligne à l'échéance (`expires_at`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('export_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->nullable()->constrained('agencies')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('activity_id')->unique()->constrained('activity_log')->cascadeOnDelete();
            $table->string('entity', 32);
            $table->string('format', 8);
            $table->boolean('own_lines_only')->default(false);
            $table->string('filename', 191);
            $table->string('mime', 100);
            $table->unsignedBigInteger('size_bytes');
            $table->string('disk', 32);
            $table->text('path');
            $table->timestamp('expires_at');
            $table->timestamps();

            $table->index(['agency_id', 'user_id']);
            $table->index('user_id');
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('export_files');
    }
};
