<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * P177.05 (TCK-2321, ADR-0039, amendement du 2026-10-25) — le relevé de gérance envoyé est
 * conservé : un instantané par agence, bailleur et mois, écrit par `payouts:send-owner-statements`
 * quand il envoie l'avis. Le mois clos est servi depuis lui, et ce qui a été écrit depuis se montre
 * en rectificatif.
 *
 * Table neuve, en ajout seul. Aucune reprise : un relevé envoyé avant cette table n'a pas
 * d'instantané, et reste le calcul du jour (aucun instantané rétroactif).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('owner_statement_snapshots', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->foreignId('landlord_id')->constrained('users')->cascadeOnDelete();
            // `YYYY-MM` : seul le relevé mensuel est envoyé ; l'attestation annuelle se lit au jour.
            $table->string('period', 7);
            $table->jsonb('payload');
            $table->timestamp('sent_at');
            $table->timestamps();

            // Un relevé envoyé par mois : le premier reste, une relance n'écrit rien.
            $table->unique(['agency_id', 'landlord_id', 'period'], 'owner_statement_snapshots_period_unique');
            $table->index('landlord_id', 'owner_statement_snapshots_landlord_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('owner_statement_snapshots');
    }
};
