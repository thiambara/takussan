<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2470 (ADR-0087 §6, ADR-0080 §2) — le réglage des cibles de la demande : UNE ligne (`id = 1`, contrainte CHECK),
 * créée éteinte. Celui qui l'allume en devient l'opérateur (`operator_id`), au nom duquel l'usage `radar.cibles` est jugé,
 * comme une source de la collecte. Rien ne part tant qu'elle est éteinte, ni sans opérateur.
 *
 * `last_run_at` et `last_run_outcome` : le dernier passage, qu'il ait appelé le modèle ou non (`applied`, `unchanged`,
 * `no_signals`, `ai.<raison>`…) — ce que l'écran dit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('radar_demand_settings', function (Blueprint $table) {
            $table->id();
            $table->boolean('enabled')->default(false);
            $table->foreignId('operator_id')->nullable()->constrained('users', 'id', 'radar_demand_settings_operator_fk')->nullOnDelete();
            $table->timestamp('enabled_at')->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->string('last_run_outcome', 64)->nullable();
            $table->timestamps();

            $table->index('operator_id', 'radar_demand_settings_operator_idx');
        });
        DB::statement('ALTER TABLE radar_demand_settings ADD CONSTRAINT radar_demand_settings_single_row CHECK (id = 1)');
        DB::table('radar_demand_settings')->insert(['id' => 1, 'enabled' => false, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function down(): void
    {
        Schema::dropIfExists('radar_demand_settings');
    }
};
