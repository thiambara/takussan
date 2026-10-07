<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-591 (ADR-0034) — le lien d'abonnement d'agenda : un jeton par couple (utilisateur, agence),
 * stocké HACHÉ (SHA-256), révocable, avec la trace du dernier accès. Le jeton en clair n'est rendu
 * qu'une fois, à la création ; il ne vit nulle part en base.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('calendar_feeds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users', 'id', 'calendar_feeds_user_fk')->cascadeOnDelete();
            // `null` : le lien d'un compte qui n'est personnel d'aucune agence (prestataire).
            $table->foreignId('agency_id')->nullable()->constrained('agencies', 'id', 'calendar_feeds_agency_fk')->cascadeOnDelete();
            $table->string('token_hash', 64)->unique('calendar_feeds_token_hash_unique');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamp('last_accessed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'agency_id'], 'calendar_feeds_user_agency_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('calendar_feeds');
    }
};
