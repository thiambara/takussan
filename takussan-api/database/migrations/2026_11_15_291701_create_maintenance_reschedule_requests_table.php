<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2917 (ADR-0118 § 3) — le locataire demande un autre créneau : un à trois instants proposés et
 * un mot. La ligne ne change jamais `scheduled_at` ; elle se clôt (`accepted`) quand le personnel ou
 * le prestataire pose un créneau, ou est remplacée (`superseded`) par la demande suivante. Pas
 * d'`agency_id` : elle se lit toujours par sa demande.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('maintenance_reschedule_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('maintenance_request_id')->constrained('maintenance_requests')->cascadeOnDelete();
            $table->foreignId('requester_id')->nullable()->constrained('users')->nullOnDelete();
            $table->json('proposed_slots');
            $table->text('note')->nullable();
            $table->string('status', 20)->default('pending');
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // La demande en attente d'une intervention : lue au détail, remplacée à la suivante.
            $table->index(['maintenance_request_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('maintenance_reschedule_requests');
    }
};
