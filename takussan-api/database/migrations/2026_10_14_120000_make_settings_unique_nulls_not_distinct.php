<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-640 — une clé de plateforme (`scope = global`, `scope_id` nul) est unique EN BASE.
 *
 * `settings_key_scope_scope_id_unique` portait sur `(key, scope, scope_id)` sans `NULLS NOT
 * DISTINCT` : PostgreSQL tenant deux `NULL` pour distincts, deux lignes globales de même clé
 * passaient. Leur unicité ne tenait qu'aux `updateOrCreate` des écrivains (`PlatformSettingService`,
 * `SettingController`, `BusinessEnumService`, `SettingsSeeder`), qui ne résistent pas à deux
 * écritures concurrentes ; et `ScopedSetting::row()` lit par `first()` sans ordre — avec deux
 * lignes, la valeur rendue n'était pas déterminée.
 *
 * Doublons existants : la ligne la plus récemment écrite (`updated_at`, puis `id`) l'emporte, les
 * autres sont supprimées — c'est celle que le dernier `updateOrCreate` a voulu écrire. `PARTITION BY`
 * range les `NULL` ensemble, ce que l'index ne faisait pas.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            DELETE FROM settings WHERE id IN (
                SELECT id FROM (
                    SELECT id, row_number() OVER (
                        PARTITION BY key, scope, scope_id ORDER BY updated_at DESC NULLS LAST, id DESC
                    ) AS rang
                    FROM settings
                ) classees
                WHERE rang > 1
            )
            SQL);

        Schema::table('settings', function (Blueprint $table) {
            $table->dropUnique(['key', 'scope', 'scope_id']);
            $table->unique(['key', 'scope', 'scope_id'])->nullsNotDistinct();
        });
    }

    /** Restaure l'unicité qui laissait passer les `NULL`. Les doublons supprimés ne reviennent pas. */
    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->dropUnique(['key', 'scope', 'scope_id']);
            $table->unique(['key', 'scope', 'scope_id']);
        });
    }
};
