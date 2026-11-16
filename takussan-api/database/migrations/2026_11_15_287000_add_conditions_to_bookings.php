<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2870 (ADR-0110 § 1) — les conditions d'une candidature et d'une offre, en colonnes de
 * `bookings`, toutes nullables : une nature n'écrit que les siennes, et aucune valeur par défaut
 * de colonne (la durée de 12 mois et le renouvellement ne valent que pour une candidature, posés
 * par `App\Services\Booking\BookingConditions`).
 *
 * - candidature : durée, renouvellement, et l'INSTANTANÉ du bien à la création (mois de caution et
 *   son montant, mois d'avance et de frais d'agence) ;
 * - offre : financement (`OfferFinancing`), délai de signature, conditions.
 *
 * `agency_fee_months_at_booking` est `decimal(4,2)` et non un entier : c'est l'instantané de
 * `properties.agency_fee_months`, lui-même `decimal(4,2)` (un demi-mois de frais existe).
 *
 * Aucune ligne existante n'est rattrapée : une candidature d'avant n'a pas vu ces conditions,
 * et en inventer une serait écrire ce qu'on ne lui a pas montré.
 */
return new class extends Migration
{
    private const COLONNES = [
        'term_months', 'renewable', 'security_deposit_months', 'security_deposit_amount',
        'advance_months_at_booking', 'agency_fee_months_at_booking',
        'financing', 'signature_within_days', 'conditions',
    ];

    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->unsignedSmallInteger('term_months')->nullable();
            $table->boolean('renewable')->nullable();
            $table->unsignedSmallInteger('security_deposit_months')->nullable();
            $table->decimal('security_deposit_amount', 14, 2)->nullable();
            $table->unsignedSmallInteger('advance_months_at_booking')->nullable();
            $table->decimal('agency_fee_months_at_booking', 4, 2)->nullable();
            $table->string('financing', 16)->nullable();
            $table->unsignedSmallInteger('signature_within_days')->nullable();
            $table->string('conditions', 500)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn(self::COLONNES);
        });
    }
};
