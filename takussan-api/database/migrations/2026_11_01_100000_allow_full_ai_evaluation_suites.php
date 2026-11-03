<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2459 — une évaluation COMPLÈTE lancée à la main depuis la console : tous les usages qui ont un
 * jeu de cas, sur leur chaîne en place. Elle n'a donc ni rôle ni candidat : les deux deviennent nuls.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_evaluation_runs', function (Blueprint $table) {
            $table->string('role', 20)->nullable()->change();
            $table->jsonb('candidate')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Une évaluation complète n'a pas de forme dans l'ancien schéma : elle disparaît.
        DB::table('ai_evaluation_runs')->whereNull('role')->delete();
        Schema::table('ai_evaluation_runs', function (Blueprint $table) {
            $table->string('role', 20)->nullable(false)->change();
            $table->jsonb('candidate')->nullable(false)->change();
        });
    }
};
