<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2431 (ADR-0077 §9, ADR-0083) — les compteurs anonymes par nature : une ligne par jour et par nature présumée
 * (`RadarAdvertiserNature`), écrite chaque jour AVANT la purge par `RadarNatureCounter`.
 *
 * - `day` : le jour du compte (Africa/Dakar), jamais un instant plus fin.
 * - `advertisers` : les annonceurs de cette nature qui portaient ce jour-là au moins une annonce non purgée et non doublon ;
 *   `listings` : ces annonces.
 *
 * **Anonyme par construction** : aucun identifiant d'annonceur ni d'annonce, aucun lieu, aucun prix, aucun site, aucune
 * horodatation de ligne. Une colonne de plus se décide avec TCK-2434 (agrégats de marché, k-anonymat, avis juridique).
 * Jamais purgée : c'est ce qui survit à la purge.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('radar_nature_counts', function (Blueprint $table) {
            $table->id();
            $table->date('day');
            $table->string('nature', 30);
            $table->unsignedInteger('advertisers');
            $table->unsignedInteger('listings');

            // L'idempotence : une écriture rejouée le même jour est ignorée (`insertOrIgnore`).
            $table->unique(['day', 'nature'], 'radar_nature_counts_day_nature_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('radar_nature_counts');
    }
};
