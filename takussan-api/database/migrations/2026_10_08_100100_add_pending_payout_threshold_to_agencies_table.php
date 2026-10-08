<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-594 (ADR-0039 §4, VERIF-594 M-2) — un relâchement du seuil des quatre yeux en attente.
 *
 * Couper le seuil, ou le relever, ne prend effet qu'à la confirmation d'un SECOND détenteur de
 * `payouts.approve`. D'ici là, la valeur demandée attend ici. `pending_payout_threshold_requested_at`
 * est le marqueur : une demande de passage à `null` laisse `pending_payout_threshold` à `null`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->decimal('pending_payout_threshold', 14, 2)->nullable();
            $table->foreignId('pending_payout_threshold_requested_by_id')->nullable()
                ->constrained('users', 'id', 'agencies_pending_threshold_by_fk')->nullOnDelete();
            $table->timestamp('pending_payout_threshold_requested_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('agencies', function (Blueprint $table) {
            $table->dropForeign('agencies_pending_threshold_by_fk');
            $table->dropColumn(['pending_payout_threshold', 'pending_payout_threshold_requested_by_id', 'pending_payout_threshold_requested_at']);
        });
    }
};
