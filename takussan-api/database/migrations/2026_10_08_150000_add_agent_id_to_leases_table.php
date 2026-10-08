<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-595 (ADR-0049 §1) — le négociateur d'un bail ou d'une vente.
 *
 * Rien n'attribuait une transaction à un agent : la tuile « Commissions » d'un agent lisait les baux
 * des biens dont il est `user_id`, ce qu'il n'est jamais pour un bien de bailleur. L'index
 * `(agent_id, signed_at)` sert la vue agent et la performance d'équipe, qui filtrent par négociateur
 * sur une période de signature.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            $table->foreignId('agent_id')->nullable()
                ->constrained('users', 'id', 'leases_agent_id_fk')->nullOnDelete();
            $table->index(['agent_id', 'signed_at'], 'leases_agent_id_signed_at_idx');
        });
    }

    public function down(): void
    {
        Schema::table('leases', function (Blueprint $table) {
            $table->dropForeign('leases_agent_id_fk');
            $table->dropIndex('leases_agent_id_signed_at_idx');
            $table->dropColumn('agent_id');
        });
    }
};
