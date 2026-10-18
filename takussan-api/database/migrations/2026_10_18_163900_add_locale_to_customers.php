<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-921 (P29.03) — la langue dans laquelle un client sans compte reçoit ses messages, saisie par
 * l'agence. Facultative : sans elle, `ContactSansCompte::fromCustomer()` garde son repli `fr`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('locale', 5)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('locale');
        });
    }
};
