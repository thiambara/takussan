<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2874 (ADR-0110 § 6) — l'origine d'une réservation (`BookingSource` : `public`, `invitation`,
 * `staff`). Défaut `public` en base : un écrivain qui ne la pose pas (seeders, factories) ne casse
 * pas ; les trois chemins de création la posent explicitement.
 *
 * Rattrapage : `staff` quand l'auteur n'est pas le compte de la fiche client — la définition de
 * `Booking::recordedOnBehalf()` (TCK-2579) : la voie du client et le tunnel public créent toujours au
 * nom de l'auteur, seule la saisie du personnel crée pour un autre. `public` sinon. Aucune ligne
 * d'avant n'est `invitation` : l'indice n'existait pas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('source', 20)->default('public');
        });

        DB::statement(<<<'SQL'
            UPDATE bookings SET source = 'staff'
            FROM customers
            WHERE customers.id = bookings.customer_id
              AND bookings.created_by_id IS NOT NULL
              AND customers.user_id IS DISTINCT FROM bookings.created_by_id
        SQL);
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('source');
        });
    }
};
