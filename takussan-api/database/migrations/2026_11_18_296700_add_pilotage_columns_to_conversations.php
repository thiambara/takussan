<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2967 (ADR-0128 § 7) — la boîte de pilotage : TROIS colonnes, et aucune colonne de file (la file
 * se dérive à la lecture, `App\Services\Messaging\FileDuFil`).
 *
 *  - `conversation_participants.snoozed_until` : « Rappelez-le-moi », propre au lecteur ;
 *  - `conversation_participants.handled_at` : « Traité », propre au lecteur (décision 2a) ;
 *  - `conversations.assigned_to_id` : la personne de l'agence qui suit une salle ou un groupe.
 *    `nullOnDelete` : un compte supprimé définitivement ne laisse pas un fil confié à personne.
 *
 * Index nommés explicitement (piège n° 3). Aucune ligne réécrite : les trois colonnes naissent nulles.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversation_participants', function (Blueprint $table) {
            $table->timestamp('snoozed_until')->nullable();
            $table->timestamp('handled_at')->nullable();
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->foreignId('assigned_to_id')->nullable()->constrained('users', 'id', 'conversations_assigned_to_id_fk')->nullOnDelete();
            $table->index('assigned_to_id', 'conversations_assigned_to_id_idx');
        });
    }

    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropForeign('conversations_assigned_to_id_fk');
            $table->dropIndex('conversations_assigned_to_id_idx');
            $table->dropColumn('assigned_to_id');
        });

        Schema::table('conversation_participants', function (Blueprint $table) {
            $table->dropColumn(['snoozed_until', 'handled_at']);
        });
    }
};
