<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2476 (ADR-0088 §7, revue adverse du 2026-11-04) — le réglage des variantes d'écriture tenues par l'IA : UNE ligne
 * (`id = 1`, contrainte CHECK), créée ÉTEINTE. Celui qui l'allume en devient l'opérateur (`operator_id`), au nom duquel
 * l'usage `search.variantes` est jugé — plus aucun `super_admin` choisi d'office. Rien ne part tant qu'elle est éteinte,
 * ni sans opérateur. Même forme que `radar_demand_settings` (TCK-2470).
 *
 * `last_run_at` et `last_run_outcome` : le dernier passage, qu'il ait appelé le modèle ou non (`applied`, `unchanged`,
 * `no_signals`, `search.aliases.operator_missing`, `ai.<raison>`…).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('search_alias_settings', function (Blueprint $table) {
            $table->id();
            $table->boolean('enabled')->default(false);
            $table->foreignId('operator_id')->nullable()->constrained('users', 'id', 'search_alias_settings_operator_fk')->nullOnDelete();
            $table->timestamp('enabled_at')->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->string('last_run_outcome', 64)->nullable();
            $table->timestamps();

            $table->index('operator_id', 'search_alias_settings_operator_idx');
        });
        DB::statement('ALTER TABLE search_alias_settings ADD CONSTRAINT search_alias_settings_single_row CHECK (id = 1)');
        DB::table('search_alias_settings')->insert(['id' => 1, 'enabled' => false, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function down(): void
    {
        Schema::dropIfExists('search_alias_settings');
    }
};
