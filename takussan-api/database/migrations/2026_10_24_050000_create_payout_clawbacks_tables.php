<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * P205.01, P177.01, P205.03 (TCK-2151, ADR-0039, amendement du 2026-10-24) — la reprise au
 * bailleur : un remboursement d'une part déjà reversée (reversement `completed`) crée une reprise au
 * net de commission, datée du remboursement, imputée au reversement suivant du même bailleur avec
 * report du reliquat.
 *
 * En ajout seul (le schéma de l'amendement, hors colonnes de pénalité, qui suivent P206.01) :
 * - `payout_clawbacks` : la reprise, sa base, son taux, sa date, et son solde à la main ;
 * - `payout_clawback_imputations` : une reprise se reporte sur plusieurs reversements ;
 * - `payouts.clawback_amount` : la reprise imputée, à côté de `fees_amount`.
 * Aucune reprise de données : tout est vide ou nul pour l'existant.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payout_clawbacks', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->foreignId('landlord_id')->constrained('users')->cascadeOnDelete();
            // Nom explicite : l'auto-généré dépasse 63 caractères, et PostgreSQL le tronquerait.
            $table->nullableMorphs('refunded_payment', 'payout_clawbacks_refunded_payment_idx');
            $table->string('part', 20)->default('payment');
            $table->foreignId('source_payout_id')->constrained('payouts')->cascadeOnDelete();
            $table->decimal('refund_amount', 14, 2);
            $table->decimal('commission_rate', 5, 2);
            $table->decimal('commission_amount', 14, 2);
            $table->decimal('amount', 14, 2);
            $table->string('currency', 3);
            $table->timestamp('refunded_at');
            $table->decimal('settled_amount', 14, 2)->nullable();
            $table->timestamp('settled_at')->nullable();
            $table->foreignId('settled_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('settlement_note')->nullable();
            $table->timestamps();

            $table->index(['agency_id', 'landlord_id'], 'payout_clawbacks_agency_landlord_idx');
            $table->index('source_payout_id', 'payout_clawbacks_source_payout_idx');
        });

        Schema::create('payout_clawback_imputations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('payout_id')->constrained('payouts')->cascadeOnDelete();
            $table->foreignId('payout_clawback_id')->constrained('payout_clawbacks')->cascadeOnDelete();
            $table->decimal('amount', 14, 2);
            $table->timestamps();

            $table->unique(['payout_id', 'payout_clawback_id'], 'payout_clawback_imputations_pair_unique');
            $table->index('payout_clawback_id', 'payout_clawback_imputations_clawback_idx');
        });

        Schema::table('payouts', function (Blueprint $table): void {
            $table->decimal('clawback_amount', 14, 2)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('payouts', function (Blueprint $table): void {
            $table->dropColumn('clawback_amount');
        });
        Schema::dropIfExists('payout_clawback_imputations');
        Schema::dropIfExists('payout_clawbacks');
    }
};
