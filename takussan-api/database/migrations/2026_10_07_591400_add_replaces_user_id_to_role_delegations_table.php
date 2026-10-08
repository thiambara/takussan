<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-591 (ADR-0035) — une absence est une ligne de `role_delegations` qui nomme l'ABSENT.
 *
 * `user_id` est le remplaçant, `replaces_user_id` l'absent ; la ligne porte le rôle
 * `absence_cover`, qui n'existe dans aucun catalogue et n'accorde donc rien. Toute lecture qui
 * veut des délégations DE RÔLE filtre `replaces_user_id IS NULL`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('role_delegations', function (Blueprint $table) {
            $table->foreignId('replaces_user_id')->nullable()
                ->constrained('users', 'id', 'role_delegations_replaces_user_fk')
                ->cascadeOnDelete();
            $table->index(['agency_id', 'replaces_user_id'], 'role_delegations_agency_replaces_idx');
        });
    }

    public function down(): void
    {
        Schema::table('role_delegations', function (Blueprint $table) {
            $table->dropIndex('role_delegations_agency_replaces_idx');
            $table->dropForeign('role_delegations_replaces_user_fk');
            $table->dropColumn('replaces_user_id');
        });
    }
};
