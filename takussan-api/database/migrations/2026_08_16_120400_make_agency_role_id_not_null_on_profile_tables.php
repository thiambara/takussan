<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-279 — troisième et dernière étape : `agency_role_id` devient NOT NULL
 * (Règle 6 : « pas de M:N, pas de fallback nullable »).
 *
 * La FK posée en 120200 n'est pas touchée : MySQL accepte `MODIFY COLUMN`
 * sur une colonne portant une FK tant que le type ne change pas. On ne
 * droppe donc ni la contrainte ni son index — le piège documenté ne
 * concerne que `dropUnique`/`dropIndex`/`dropColumn`.
 */
return new class extends Migration
{
    private const TABLES = ['agent_profiles', 'agency_admin_profiles', 'owner_profiles'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            $orphans = DB::table($table)->whereNull('agency_role_id')->count();
            if ($orphans > 0) {
                throw new RuntimeException(
                    "TCK-279: `{$table}` porte encore {$orphans} ligne(s) sans `agency_role_id` — ".
                    'le backfill 120300 n\'a pas abouti. NOT NULL refusé.'
                );
            }

            Schema::table($table, function (Blueprint $blueprint): void {
                $blueprint->unsignedBigInteger('agency_role_id')->nullable(false)->change();
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $blueprint): void {
                $blueprint->unsignedBigInteger('agency_role_id')->nullable()->change();
            });
        }
    }
};
