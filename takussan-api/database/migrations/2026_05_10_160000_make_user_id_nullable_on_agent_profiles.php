<?php

use App\Services\Invitation\InvitationService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-258 — un AgentProfile peut être créé en `draft` au moment de l'envoi
 * d'une invitation, avant que l'utilisateur cible n'existe (compte créé à
 * l'acceptation par {@see InvitationService}).
 *
 * Conséquence : `user_id` doit pouvoir être `NULL` pour la durée du draft,
 * et redevient renseigné à l'acceptation. La contrainte `unique(user_id,
 * agency_id)` reste valide (PostgreSQL et MySQL acceptent plusieurs NULL
 * dans une contrainte unique multi-colonnes), donc plusieurs drafts
 * peuvent coexister par agence.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('agent_profiles', function (Blueprint $table): void {
            $table->foreignId('user_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('agent_profiles', function (Blueprint $table): void {
            $table->foreignId('user_id')->nullable(false)->change();
        });
    }
};
