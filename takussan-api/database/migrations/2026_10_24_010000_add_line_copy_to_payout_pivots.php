<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * P177.01 et P177.02 (TCK-2017) — la copie, ligne par ligne, de ce que le reversement a pris de
 * chaque pièce : le montant retenu, le taux appliqué et la commission. Posée à la création du
 * reversement (`PayoutService::createLocked`), elle ne suit plus le taux d'agence du jour.
 *
 * Additive et nullable : une ligne d'avant cette migration n'a pas de copie, et le relevé la lit
 * alors comme avant (taux du jour). Aucune reprise de données.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['payout_lease_payment', 'payout_booking_payment'] as $pivot) {
            Schema::table($pivot, function (Blueprint $table): void {
                $table->decimal('amount', 14, 2)->nullable();
                $table->decimal('commission_rate', 5, 2)->nullable();
                $table->decimal('commission_amount', 14, 2)->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (['payout_lease_payment', 'payout_booking_payment'] as $pivot) {
            Schema::table($pivot, function (Blueprint $table): void {
                $table->dropColumn(['amount', 'commission_rate', 'commission_amount']);
            });
        }
    }
};
