<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2759 (ADR-0099, amendement du 2026-11-12, décision 9 (b) du porteur) — un document de fiche
 * client peut être INTERNE : le personnel actif de l'agence de la fiche et le super-admin le lisent,
 * jamais le sujet de la fiche (`App\Policies\DocumentPolicy::readsInternalOf()`).
 *
 * `NOT NULL DEFAULT false`, sans migration de données (§ 6) : les documents existants ont été déposés
 * sous la règle « le client les lit », et la gardent. Le défaut `true` du téléversement par le
 * personnel sur une fiche est celui de `POST /api/documents`, pas de la colonne (§ 5).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->boolean('is_internal')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropColumn('is_internal');
        });
    }
};
