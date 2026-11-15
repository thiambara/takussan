<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2871 — qui a annulé une visite : `visitor` (le visiteur, ou le client rattaché par sa fiche)
 * ou `agency` (quiconque annule au nom de l'agence), posé par `VisitSchedulingService::cancelOrFail`
 * dans la transaction qui annule. Le client lit « Annulée par vous ».
 *
 * Aucune ligne existante n'est rattrapée : rien ne dit qui a annulé une visite d'avant (`null`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('property_visits', function (Blueprint $table) {
            $table->string('cancelled_by', 16)->nullable();
        });

        DB::statement("ALTER TABLE property_visits ADD CONSTRAINT property_visits_cancelled_by_check CHECK (cancelled_by IS NULL OR cancelled_by IN ('visitor', 'agency'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE property_visits DROP CONSTRAINT IF EXISTS property_visits_cancelled_by_check');

        Schema::table('property_visits', function (Blueprint $table) {
            $table->dropColumn('cancelled_by');
        });
    }
};
