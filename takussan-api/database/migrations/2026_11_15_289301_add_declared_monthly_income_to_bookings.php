<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2893 (ADR-0110 § 4, ADR-0070) — le revenu mensuel déclaré par le candidat, CHIFFRÉ (cast
 * `encrypted` de `Booking`, d'où `text` : un chiffré ne tient pas dans un `varchar(255)`). Jamais
 * servi en clair par `BookingResource` ; `backup:verify-encryption` le trouve par son cast.
 *
 * Aucune ligne existante n'est rattrapée : une candidature d'avant n'a déclaré aucun revenu.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->text('declared_monthly_income')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('declared_monthly_income');
        });
    }
};
