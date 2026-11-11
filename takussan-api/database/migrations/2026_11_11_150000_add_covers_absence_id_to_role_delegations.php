<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2666 (ADR-0035, amendement du 2026-11-10) — une absence peut porter une délégation de rôle
 * LIÉE. Le lien est porté par la délégation : `covers_absence_id` vise la ligne d'absence de la
 * même table, `cascadeOnDelete`.
 *
 * Unicité PARTIELLE : une absence porte au plus UNE délégation EN COURS (`scheduled`, `active`).
 * Changer de remplaçant révoque la délégation et en crée une autre, et retirer puis rendre le droit
 * aussi : les délégations révoquées gardent leur lien, l'historique « couvre l'absence de… » reste.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('role_delegations', function (Blueprint $table) {
            $table->foreignId('covers_absence_id')->nullable()
                ->constrained('role_delegations', 'id', 'role_delegations_covers_absence_fk')
                ->cascadeOnDelete();
            $table->index('covers_absence_id', 'role_delegations_covers_absence_idx');
        });

        DB::statement(
            "CREATE UNIQUE INDEX role_delegations_live_cover_unique ON role_delegations (covers_absence_id)
             WHERE covers_absence_id IS NOT NULL AND status IN ('scheduled', 'active')"
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS role_delegations_live_cover_unique');

        Schema::table('role_delegations', function (Blueprint $table) {
            $table->dropIndex('role_delegations_covers_absence_idx');
            $table->dropForeign('role_delegations_covers_absence_fk');
            $table->dropColumn('covers_absence_id');
        });
    }
};
