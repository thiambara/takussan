<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2892 (ADR-0110 § 1, séjour) — l'heure à partir de laquelle on arrive et celle avant laquelle
 * on part, d'un bien loué à la nuit ou à la semaine. Facultatives, SANS défaut de colonne : le
 * front affiche 14:00 / 11:00 quand elles manquent, l'API n'invente rien.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->time('check_in_from')->nullable();
            $table->time('check_out_before')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropColumn(['check_in_from', 'check_out_before']);
        });
    }
};
