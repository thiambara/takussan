<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2937 (ADR-0125) — la date à laquelle une agence a été ouverte en libre-service par son propre
 * administrateur, depuis l'orientation (`POST /api/me/agencies`). Tant qu'elle est posée et que
 * l'agence n'est pas vérifiée, aucun bien ne se met en ligne et l'agence n'apparaît pas dans
 * l'annuaire public. Nulle pour toute agence de la console ou d'un passage en pro : ces agences
 * gardent leur comportement.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->timestamp('self_opened_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->dropColumn('self_opened_at');
        });
    }
};
