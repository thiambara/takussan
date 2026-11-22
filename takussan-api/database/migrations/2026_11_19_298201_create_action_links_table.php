<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2982 (ADR-0132 § 5) — le lien d'action : UN geste sur UN objet, pour UN compte, une fois, 7 jours.
 *
 * Seule l'EMPREINTE du jeton est gardée (`token_hash`, SHA-256 en hexadécimal) : le clair n'existe que
 * dans le message envoyé. `subject_type` est une clé du registre `SujetsDuFil`, sans clé étrangère (lien
 * générique). `phone` (le numéro qui l'a reçu) est effacé 90 jours après l'expiration
 * (`pont:effacer-numeros`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('action_links', function (Blueprint $table) {
            $table->id();
            $table->char('token_hash', 64)->unique('action_links_token_hash_unique');
            $table->string('gesture', 40);
            $table->string('subject_type', 40);
            $table->unsignedBigInteger('subject_id');
            $table->foreignId('user_id')->constrained('users', 'id', 'action_links_user_id_fk')->cascadeOnDelete();
            $table->string('phone', 20)->nullable();
            $table->foreignId('message_id')->nullable()->constrained('messages', 'id', 'action_links_message_id_fk')->nullOnDelete();
            $table->foreignId('message_relay_id')->nullable()->constrained('message_relays', 'id', 'action_links_message_relay_id_fk')->nullOnDelete();
            $table->timestamp('expires_at');
            $table->timestamp('opened_at')->nullable();
            $table->timestamp('used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->index(['subject_type', 'subject_id'], 'action_links_subject_idx');
            $table->index(['user_id', 'gesture'], 'action_links_user_gesture_idx');
            $table->index('message_id', 'action_links_message_id_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('action_links');
    }
};
