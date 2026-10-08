<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-594 (ADR-0039 §3, AC3) — un paiement n'est reversé qu'une fois, et c'est la base qui le dit.
 *
 * La clé primaire `(payout_id, lease_payment_id)` autorisait le même paiement dans deux
 * reversements. Avant de poser l'index, on garde pour chaque paiement la ligne du plus ancien
 * reversement non annulé (le seeder n'en produit pas de doublon, mais une base réelle a pu en
 * écrire) ; les lignes d'un reversement `cancelled` ou `failed` sont détachées, comme le fait
 * désormais le service.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach ([['payout_lease_payment', 'lease_payment_id'], ['payout_booking_payment', 'booking_payment_id']] as [$pivot, $column]) {
            DB::statement(<<<SQL
                DELETE FROM {$pivot} p
                USING payouts po
                WHERE po.id = p.payout_id AND po.status IN ('cancelled', 'failed')
            SQL);

            DB::statement(<<<SQL
                DELETE FROM {$pivot} p
                WHERE EXISTS (
                    SELECT 1 FROM {$pivot} q
                    WHERE q.{$column} = p.{$column} AND q.payout_id < p.payout_id
                )
            SQL);
        }

        Schema::table('payout_lease_payment', function (Blueprint $table) {
            $table->unique('lease_payment_id', 'payout_lp_lease_payment_unique');
        });

        Schema::table('payout_booking_payment', function (Blueprint $table) {
            $table->unique('booking_payment_id', 'payout_bp_booking_payment_unique');
        });
    }

    public function down(): void
    {
        Schema::table('payout_lease_payment', function (Blueprint $table) {
            $table->dropUnique('payout_lp_lease_payment_unique');
        });

        Schema::table('payout_booking_payment', function (Blueprint $table) {
            $table->dropUnique('payout_bp_booking_payment_unique');
        });
    }
};
