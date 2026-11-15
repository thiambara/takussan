<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2893 (ADR-0110 § 3) — les garants d'une candidature ou d'une offre : la table `guarantors`
 * existante (pièce et revenu chiffrés, ADR-0070), rattachée par un pivot comme au bail
 * (`lease_guarantor`). Trois au plus par réservation : la borne se juge sous verrou
 * (`BookingGuarantorService`), l'unicité du couple ici.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_guarantor', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->foreignId('guarantor_id')->constrained('guarantors')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['booking_id', 'guarantor_id'], 'booking_guarantor_unique');
            $table->index('guarantor_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_guarantor');
    }
};
