<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-596 §3B (ADR-0041) — l'empreinte SHA-256 du jeton d'export iCal d'un bien. Le jeton en clair
 * n'est jamais stocké : il n'existe qu'au retour de sa régénération.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->string('ical_export_token_hash', 64)->nullable()->unique('properties_ical_token_hash_unique');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropUnique('properties_ical_token_hash_unique');
            $table->dropColumn('ical_export_token_hash');
        });
    }
};
