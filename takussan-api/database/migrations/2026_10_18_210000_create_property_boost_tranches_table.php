<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-942 (P24.05, amendement du 2026-10-18 d'ADR-0061) — chaque achat ou offre d'une Vedette est une
 * TRANCHE : son prix figé, sa durée, son rang. Une prolongation en ajoute une au lieu de fondre son
 * prix et sa durée dans la ligne du boost, et le remboursement rend les jours restants les plus
 * tardifs d'abord, au prix de la tranche qui les a achetés. Ni `property_boosts` (une ligne cumulée)
 * ni `credit_movements` (ni durée, et aucun mouvement pour une tranche offerte) ne permettaient de
 * reconstituer les tranches.
 *
 * Reprise : AUCUNE ligne n'est écrite ici. Un boost sans tranche est sa propre tranche unique, au prix
 * et à la durée de sa ligne (`BoostLifecycle::tranchesOf()`), ce qui rembourse une Vedette prolongée
 * avant ce changement exactement comme avant ; si elle est prolongée après, `BoostPurchaseService`
 * écrit d'abord cette tranche de reprise, puis la nouvelle. Un remplissage ici n'aurait pas suffi :
 * `LegacyFeaturedConversion` (seeder) et les Badges écrivent encore des boosts sans tranche.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('property_boost_tranches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_boost_id')->constrained('property_boosts', 'id', 'property_boost_tranches_boost_fk')->cascadeOnDelete();
            // Rang dans l'ordre d'achat, à partir de 1 : le remboursement part du plus grand.
            $table->unsignedSmallInteger('position');
            $table->unsignedInteger('price_credits');
            $table->unsignedSmallInteger('duration_days');
            $table->boolean('offered')->default(false);
            $table->timestamps();
            // L'unicité sert aussi l'index de la clé étrangère (piège PostgreSQL n°8) : elle la préfixe.
            $table->unique(['property_boost_id', 'position'], 'property_boost_tranches_boost_position_unique');
        });
        DB::statement('ALTER TABLE property_boost_tranches ADD CONSTRAINT property_boost_tranches_values_check CHECK (position >= 1 AND price_credits >= 0 AND duration_days > 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('property_boost_tranches');
    }
};
