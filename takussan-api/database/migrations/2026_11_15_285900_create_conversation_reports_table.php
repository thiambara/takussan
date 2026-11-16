<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2859 (ADR-0114 § 2) — le signalement d'une conversation par un de ses participants.
 *
 * - `reason` : un code de `App\Http\Requests\Conversation\ReportConversationRequest::REASONS` ;
 * - `comment` : texte libre facultatif, 500 caractères au plus ;
 * - un seul signalement par auteur et par fil : l'index unique `(conversation_id, reporter_id)`,
 *   que l'écriture respecte par `insertOrIgnore` (une violation abandonnerait la transaction).
 *
 * Lu par le seul super-admin (`GET /api/admin/conversation-reports`). Aucune donnée existante.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversation_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained('conversations')->cascadeOnDelete();
            $table->foreignId('reporter_id')->constrained('users')->cascadeOnDelete();
            $table->string('reason', 32);
            $table->string('comment', 500)->nullable();
            $table->timestamps();

            $table->unique(['conversation_id', 'reporter_id']);
            $table->index('reporter_id');
            // La file de la console se lit du plus récent au plus ancien.
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('conversation_reports');
    }
};
