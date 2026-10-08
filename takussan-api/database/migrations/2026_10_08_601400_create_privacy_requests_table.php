<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-601 (ADR-0044 §4) — le registre des demandes de droits (accès, rectification, opposition,
 * effacement, portabilité), suivi par le super-admin jusqu'à son échéance.
 *
 * `type`, `channel`, `status` : `string` + enum applicative (ADR-0007, jamais `enum()`). Les liens
 * vers l'export et la demande d'effacement sont `nullOnDelete` : annuler un effacement SUPPRIME la
 * demande (`AccountDeletionService::cancelDeletion`), l'entrée du registre reste et passe
 * `withdrawn`. Le demandeur peut ne pas avoir de compte (demande reçue par courriel) : `user_id`
 * nullable, nom et contact en clair, comme sur toute fiche de contact.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('privacy_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()
                ->constrained('users', 'id', 'privacy_requests_user_fk')->nullOnDelete();
            $table->string('requester_name');
            $table->string('requester_contact')->nullable();
            $table->string('type', 20);
            $table->string('channel', 20);
            $table->timestamp('received_at');
            $table->timestamp('due_at');
            $table->string('status', 20)->default('received');
            $table->timestamp('answered_at')->nullable();
            $table->text('response_summary')->nullable();
            $table->foreignId('handled_by')->nullable()
                ->constrained('users', 'id', 'privacy_requests_handled_by_fk')->nullOnDelete();
            $table->foreignId('data_export_id')->nullable()
                ->constrained('data_exports', 'id', 'privacy_requests_data_export_fk')->nullOnDelete();
            $table->foreignId('account_deletion_request_id')->nullable()
                ->constrained('account_deletion_requests', 'id', 'privacy_requests_deletion_fk')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'due_at'], 'privacy_requests_status_due_idx');
            $table->index('user_id', 'privacy_requests_user_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('privacy_requests');
    }
};
