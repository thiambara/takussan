<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2969 (ADR-0130 § 1) — l'engagement, un objet du fil : une table à lui, jamais une ligne de `tasks`.
 *
 *  - `conversation_id` : le fil où il est né (`cascadeOnDelete` : il n'existe pas hors d'un fil) ;
 *  - `source_message_id` : le message d'où il a été noté (`nullOnDelete`) ;
 *  - `object_type` / `object_id` : une CLÉ du registre `SujetsDuFil`, sans clé étrangère (lien générique) ;
 *  - `agency_id` : l'agence du fil à la création ;
 *  - `holder_id` (le porteur), `beneficiary_id` (envers qui, nul = l'agence), `created_by_id` ;
 *  - les instants du cycle de vie, et les marqueurs du signal planifié (TCK-2970).
 *
 * « En retard » n'est pas un statut : `status = open` et `due_at < maintenant`, jugé à l'instant.
 *
 * Index nommés explicitement. `(agency_id, …)` en tête d'un index : `AgencyIdIsIndexedTest` exige un index
 * dont `agency_id` est la PREMIÈRE colonne.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('commitments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained('conversations', 'id', 'commitments_conversation_id_fk')->cascadeOnDelete();
            $table->foreignId('source_message_id')->nullable()->constrained('messages', 'id', 'commitments_source_message_id_fk')->nullOnDelete();
            $table->string('object_type', 40)->nullable();
            $table->unsignedBigInteger('object_id')->nullable();
            $table->foreignId('agency_id')->constrained('agencies', 'id', 'commitments_agency_id_fk')->cascadeOnDelete();
            $table->foreignId('holder_id')->constrained('users', 'id', 'commitments_holder_id_fk')->cascadeOnDelete();
            $table->foreignId('beneficiary_id')->nullable()->constrained('users', 'id', 'commitments_beneficiary_id_fk')->nullOnDelete();
            $table->foreignId('created_by_id')->nullable()->constrained('users', 'id', 'commitments_created_by_id_fk')->nullOnDelete();
            $table->string('title', 160);
            $table->timestamp('due_at');
            $table->string('status', 20);
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamp('kept_at')->nullable();
            $table->foreignId('kept_by_id')->nullable()->constrained('users', 'id', 'commitments_kept_by_id_fk')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->foreignId('cancelled_by_id')->nullable()->constrained('users', 'id', 'commitments_cancelled_by_id_fk')->nullOnDelete();
            $table->string('cancel_reason', 40)->nullable();
            $table->timestamp('reopened_at')->nullable();
            $table->foreignId('reopened_by_id')->nullable()->constrained('users', 'id', 'commitments_reopened_by_id_fk')->nullOnDelete();
            $table->string('reopen_reason', 500)->nullable();
            $table->timestamp('party_reopened_at')->nullable();
            $table->timestamp('overdue_at')->nullable();
            $table->timestamp('due_soon_sent_at')->nullable();
            $table->timestamp('overdue_signalled_at')->nullable();
            $table->unsignedSmallInteger('relances')->default(0);
            $table->timestamp('last_relance_at')->nullable();
            $table->timestamps();

            $table->index(['conversation_id', 'status', 'due_at'], 'commitments_conversation_status_due_idx');
            $table->index(['holder_id', 'agency_id', 'due_at'], 'commitments_holder_agency_due_idx');
            $table->index(['object_type', 'object_id'], 'commitments_object_idx');
            $table->index(['agency_id', 'status'], 'commitments_agency_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('commitments');
    }
};
