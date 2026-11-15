<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2761 — la recherche d'une fiche DÉDUITE du bien de sa demande (« Déduit du bien de sa demande,
 * à confirmer avec lui. »). Posée par `ContactLeadService::linkLead()` quand toute la recherche de la
 * fiche vient du bien ; effacée par `Customer` dès qu'un critère change. Aucune reprise : une fiche
 * créée avant ne sait pas d'où viennent ses critères, elle garde `null`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->timestamp('seeking_deduced_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('seeking_deduced_at');
        });
    }
};
