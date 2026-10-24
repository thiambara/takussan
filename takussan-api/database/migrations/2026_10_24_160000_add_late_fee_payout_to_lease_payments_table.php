<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * P206.01 (ADR-0039, amendement du 2026-10-24, point 6) — la pénalité de retard réglée est une
 * ligne propre du reversement au bailleur. Elle n'a pas de pivot : la ligne du loyer porte le
 * reversement qui l'a prise (`late_fee_payout_id`, son éligibilité propre) et la copie figée de ce
 * qu'il en a pris (montant, taux, commission), comme les pivots depuis TCK-2017.
 *
 * Additive et nullable : aucune reprise de données, toute ligne existante reste sans reversement.
 * Un reversement `cancelled` ou `failed` remet les quatre colonnes à nul (`PayoutService`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lease_payments', function (Blueprint $table): void {
            $table->foreignId('late_fee_payout_id')->nullable()
                ->constrained('payouts', 'id', 'lease_payments_late_fee_payout_fk')->nullOnDelete();
            $table->decimal('late_fee_payout_amount', 14, 2)->nullable();
            $table->decimal('late_fee_payout_commission_rate', 5, 2)->nullable();
            $table->decimal('late_fee_payout_commission_amount', 14, 2)->nullable();
            $table->index('late_fee_payout_id', 'lease_payments_late_fee_payout_idx');
        });
    }

    public function down(): void
    {
        Schema::table('lease_payments', function (Blueprint $table): void {
            $table->dropForeign('lease_payments_late_fee_payout_fk');
            $table->dropIndex('lease_payments_late_fee_payout_idx');
            $table->dropColumn([
                'late_fee_payout_id',
                'late_fee_payout_amount',
                'late_fee_payout_commission_rate',
                'late_fee_payout_commission_amount',
            ]);
        });
    }
};
