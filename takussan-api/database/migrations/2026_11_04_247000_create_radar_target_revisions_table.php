<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2470 (ADR-0087 §6) — une révision des cibles de la demande : un passage de l'usage `radar.cibles` qui a appelé le
 * modèle, ce que le code en a appliqué et ce qu'il en a écarté.
 *
 * - `operations` : les opérations appliquées, telles que validées par le code (`op`, `target_id`, `merge_ids`, `name`,
 *   `criteria`, `reason`, `signal_refs`).
 * - `discarded` : les opérations écartées, chacune avec son code (`radar.demand.*`, `radar.targets.*`).
 * - `before` : l'état, avant la révision, de chaque cible qu'elle a touchée (`created: true` pour une cible qu'elle a créée) —
 *   ce que « défaire » rétablit.
 * - `signals_signature` : l'empreinte des signaux lus ; la même au passage suivant → aucun appel.
 * - `ai_call_id` : la ligne du journal des appels (nulle si le journal est purgé).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('radar_target_revisions', function (Blueprint $table) {
            $table->id();
            $table->jsonb('operations')->default('[]');
            $table->jsonb('discarded')->default('[]');
            $table->jsonb('before')->default('[]');
            $table->string('signals_signature', 64);
            $table->unsignedInteger('signals_count')->default(0);
            $table->foreignId('ai_call_id')->nullable()->constrained('ai_calls', 'id', 'radar_target_revisions_ai_call_fk')->nullOnDelete();
            $table->timestamp('reverted_at')->nullable();
            $table->foreignId('reverted_by_id')->nullable()->constrained('users', 'id', 'radar_target_revisions_reverted_by_fk')->nullOnDelete();
            $table->timestamps();

            $table->index('ai_call_id', 'radar_target_revisions_ai_call_idx');
            $table->index('reverted_by_id', 'radar_target_revisions_reverted_by_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('radar_target_revisions');
    }
};
