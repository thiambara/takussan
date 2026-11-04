<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2465 (ADR-0087 §1) — ce que la page d'une annonce dit en clair, lu par l'adaptateur de son site sans IA
 * (`ListingPage::sourceFields()` : téléphones, prix, lieu, vendeur et ses indices…), ou les seuls numéros des attributs
 * pour un site sans adaptateur. Nul pour une saisie de texte ou de captures. Données personnelles (numéros, nom du
 * vendeur) : effacé avec le reste de la matière de l'annonce par `RadarPurger`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_listings', function (Blueprint $table) {
            $table->jsonb('source_fields')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('radar_listings', function (Blueprint $table) {
            $table->dropColumn('source_fields');
        });
    }
};
