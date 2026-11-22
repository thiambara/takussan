<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2892 (ADR-0110 § 1, séjour) — le nombre de voyageurs d'un séjour, en colonne. Il vivait dans
 * `metadata.guests` (tunnel public, `BookingService::create`), écrit et jamais servi.
 *
 * Rattrapage : les SEULS séjours (`kind = 'stay'`) — une candidature du tunnel public portait aussi
 * `metadata.guests`, que la règle d'aujourd'hui refuse à une candidature. Une valeur qui n'est pas
 * un entier positif de 1 à 4 chiffres est laissée de côté (une seule ligne fautive abandonnerait la
 * transaction entière sous PostgreSQL). `metadata.guests` reste écrit et n'est plus lu : `down()`
 * ne perd donc rien.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->unsignedSmallInteger('guests')->nullable();
        });

        DB::statement(<<<'SQL'
            UPDATE bookings
               SET guests = (metadata->>'guests')::smallint
             WHERE kind = 'stay'
               AND guests IS NULL
               AND (metadata->>'guests') ~ '^[1-9][0-9]{0,3}$'
            SQL);
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('guests');
        });
    }
};
