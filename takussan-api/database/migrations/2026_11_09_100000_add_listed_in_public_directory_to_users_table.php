<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2506 — un propriétaire particulier ne paraît dans l'annuaire public « Agents &
 * propriétaires » que s'il l'a choisi. Défaut `false` pour TOUS les comptes, existants compris :
 * la migration n'en liste aucun d'office. Sans effet sur un agent en exercice, toujours listé.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('listed_in_public_directory')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('listed_in_public_directory');
        });
    }
};
