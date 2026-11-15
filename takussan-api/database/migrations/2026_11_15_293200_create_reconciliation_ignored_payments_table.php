<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2932 — un paiement sorti du « reste à rapprocher » parce qu'il n'aura jamais de ligne de
 * banque (espèces gardées en caisse, versé sur un autre compte). Les paiements du reste à
 * rapprocher sont polymorphes (échéance de bail, acompte de réservation) : une table, pas une
 * colonne. La ligne ne touche jamais le paiement — ni solde, ni quittance, ni reversement — et se
 * supprime pour défaire le geste ; les deux gestes sont journalisés sur le paiement (`activity_log`).
 *
 * `payable_type` porte la CLASSE du paiement, comme `bank_statement_lines.matched_payment_type`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reconciliation_ignored_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->string('payable_type');
            $table->unsignedBigInteger('payable_id');
            $table->string('reason', 32);
            $table->text('note')->nullable();
            $table->foreignId('ignored_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // Un paiement n'est ignoré qu'une fois ; l'index sert aussi l'exclusion du reste à rapprocher.
            $table->unique(['payable_type', 'payable_id']);
            // La liste des paiements ignorés d'une agence, du plus récent au plus ancien.
            $table->index(['agency_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reconciliation_ignored_payments');
    }
};
