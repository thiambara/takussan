<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-891 (P04.11) — `transaction_id` des échéances et des paiements de réservation porte un index.
 *
 * `PaymentGatewayService::paymentsForEvent()` cherche le payable de chaque webhook entrant par
 * `transaction_id`, sur les trois payables. Seule `invoices` portait un index sur cette colonne
 * (`2026_08_16_090000`) : PostgreSQL n'indexe rien d'office (piège n° 8 de `CLAUDE.md`). Noms
 * explicites, comme `invoices_transaction_id_idx` (piège n° 3). Ajout d'index seul, sans
 * réécriture de données.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lease_payments', function (Blueprint $table): void {
            $table->index('transaction_id', 'lease_payments_transaction_id_idx');
        });
        Schema::table('booking_payments', function (Blueprint $table): void {
            $table->index('transaction_id', 'booking_payments_transaction_id_idx');
        });
    }

    public function down(): void
    {
        Schema::table('booking_payments', function (Blueprint $table): void {
            $table->dropIndex('booking_payments_transaction_id_idx');
        });
        Schema::table('lease_payments', function (Blueprint $table): void {
            $table->dropIndex('lease_payments_transaction_id_idx');
        });
    }
};
