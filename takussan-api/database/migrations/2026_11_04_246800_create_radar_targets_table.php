<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2468 (ADR-0087 §5) — les cibles du Radar : des critères de recherche qui bornent ce qu'une source ciblée saisit.
 *
 * `origin` : `operator` (créée dans la console) ou `demand` (créée par la demande sans résultat, TCK-2470). `status` :
 * `active`, `paused` ou `retired` — une cible ne se supprime jamais, elle se retire. Chaînes et non `enum()` SQL (ADR-0007),
 * lues par `RadarTargetOrigin` et `RadarTargetStatus`.
 *
 * `criteria` : la forme normalisée par `App\Services\Radar\Targets\RadarTargetCriteria`. `criteria_signature` : son
 * empreinte (SHA-256 des critères repliés), UNIQUE parmi les cibles non retirées (index partiel) — deux cibles vivantes ne
 * visent jamais la même chose ; une cible retirée n'empêche pas d'en recréer une identique.
 *
 * `demand_count` : le nombre de recherches qui la portent (cible `demand`), null pour une cible de l'opérateur.
 * `matches_count` et `last_matched_at` suivent le pivot `radar_listing_target` (recomptés à chaque rattachement).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('radar_targets', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('origin', 20);
            $table->string('status', 20);
            $table->boolean('pinned')->default(false);
            $table->jsonb('criteria');
            $table->string('criteria_signature', 64);
            $table->unsignedInteger('demand_count')->nullable();
            $table->unsignedInteger('matches_count')->default(0);
            $table->timestamp('last_matched_at')->nullable();
            $table->foreignId('created_by_id')->nullable()->constrained('users', 'id', 'radar_targets_created_by_fk')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'origin'], 'radar_targets_status_origin_idx');
            $table->index('created_by_id', 'radar_targets_created_by_idx');
        });
        DB::statement("CREATE UNIQUE INDEX radar_targets_live_signature_unique ON radar_targets (criteria_signature) WHERE status <> 'retired'");
    }

    public function down(): void
    {
        Schema::dropIfExists('radar_targets');
    }
};
