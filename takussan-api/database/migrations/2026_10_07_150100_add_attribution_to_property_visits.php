<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-590 — d'où vient une demande de visite (`source`, `medium` : le lien partagé qui l'a
 * amenée) et dans quelle langue prévenir un visiteur SANS compte (`locale`) : sans compte, il n'a
 * pas de `preferred_language`, et la confirmation partait dans la langue du serveur.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('property_visits', function (Blueprint $table) {
            $table->string('source', 40)->nullable()->after('notes');
            $table->string('medium', 40)->nullable()->after('source');
            $table->string('locale', 5)->nullable()->after('medium');
        });
    }

    public function down(): void
    {
        Schema::table('property_visits', function (Blueprint $table) {
            $table->dropColumn(['source', 'medium', 'locale']);
        });
    }
};
