<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2448 (ADR-0085 §1) — un identifiant de modèle peut porter `éditeur/modèle` et un suffixe
 * `:…` : 80 caractères ne suffisent plus.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_usage_settings', function (Blueprint $table) {
            $table->string('forced_model', 255)->nullable()->change();
        });
        Schema::table('ai_calls', function (Blueprint $table) {
            $table->string('model', 255)->nullable()->change();
        });
    }

    /**
     * Un identifiant trop long ne revient pas tronqué dans un modèle forcé : il désignerait un autre
     * modèle, ou aucun. Le forçage saute d'un bloc. Le journal, lui, garde ce qui tient.
     */
    public function down(): void
    {
        DB::table('ai_usage_settings')->whereRaw('char_length(forced_model) > 80')->update(['forced_provider' => null, 'forced_model' => null]);
        DB::table('ai_calls')->whereRaw('char_length(model) > 80')->update(['model' => DB::raw('left(model, 80)')]);

        Schema::table('ai_usage_settings', function (Blueprint $table) {
            $table->string('forced_model', 80)->nullable()->change();
        });
        Schema::table('ai_calls', function (Blueprint $table) {
            $table->string('model', 80)->nullable()->change();
        });
    }
};
