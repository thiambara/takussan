<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-598 — le COÛT D'ENTRÉE d'une location mensuelle (V9) et la visite virtuelle (V19).
 *
 * Le coût d'entrée n'existait que sur le bail (`leases.deposit_amount`, `commission_amount`) : le
 * visiteur ne savait pas, avant de signer, ce qu'il devrait verser pour emménager. Les mois sont des
 * entiers (0 à 24), les frais d'agence s'expriment EN MOIS DE LOYER (0,5 ou 1 le plus souvent,
 * option retenue par défaut), les charges en montant mensuel. Le total est calculé par l'API.
 *
 * Aucun `enum()` (ADR-0007), aucun index : on indexe sur mesure (TCK-508).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->unsignedSmallInteger('deposit_months')->nullable();
            $table->unsignedSmallInteger('advance_months')->nullable();
            $table->decimal('agency_fee_months', 4, 2)->nullable();
            $table->decimal('monthly_charges', 14, 2)->nullable();
            $table->string('virtual_tour_url', 2048)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropColumn(['deposit_months', 'advance_months', 'agency_fee_months', 'monthly_charges', 'virtual_tour_url']);
        });
    }
};
