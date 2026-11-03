<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2448 (ADR-0086) — le coût d'un appel et le plafond d'un usage passent en dollars, en `numeric`
 * sans précision. Aucune reconversion (décision 6) : `origin/preview` n'a pas `ai_calls`, l'API n'a
 * jamais servi en production, et un montant XOF arrondi à 2 décimales ne redonnerait pas le dollar.
 * Le `down()` rétablit donc les colonnes, vides.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_calls', function (Blueprint $table) {
            $table->dropColumn('cost_estimate');
        });
        Schema::table('ai_calls', function (Blueprint $table) {
            $table->rawColumn('cost_estimate_usd', 'numeric')->nullable();
        });
        Schema::table('ai_usage_settings', function (Blueprint $table) {
            $table->dropColumn('daily_budget_xof');
        });
        Schema::table('ai_usage_settings', function (Blueprint $table) {
            $table->rawColumn('daily_budget_usd', 'numeric')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('ai_calls', function (Blueprint $table) {
            $table->dropColumn('cost_estimate_usd');
        });
        Schema::table('ai_calls', function (Blueprint $table) {
            $table->decimal('cost_estimate', 14, 2)->nullable();
        });
        Schema::table('ai_usage_settings', function (Blueprint $table) {
            $table->dropColumn('daily_budget_usd');
        });
        Schema::table('ai_usage_settings', function (Blueprint $table) {
            $table->decimal('daily_budget_xof', 14, 2)->nullable();
        });
    }
};
