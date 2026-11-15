<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2502 — la tranche de la journée qu'un visiteur demande quand il ne choisit pas d'heure
 * (`App\Models\Enums\VisitWindow` : `morning`, `afternoon`, `evening`).
 *
 * Posée, `scheduled_at` porte le DÉBUT de la tranche et l'heure reste à fixer ; l'agent la fixe en
 * confirmant, ce qui remet la colonne à `null`. Aucune visite existante n'en a : pas de remplissage.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('property_visits', function (Blueprint $table) {
            $table->string('preferred_window', 16)->nullable()->after('scheduled_at');
        });
    }

    public function down(): void
    {
        Schema::table('property_visits', function (Blueprint $table) {
            $table->dropColumn('preferred_window');
        });
    }
};
