<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2388 (ADR-0077 §11, modèle d'ADR-0043 §7) — la prise en charge de 10 minutes d'un annonceur vit sur
 * sa ligne : c'est le point de sérialisation de tout geste de démarchage (piège n° 2), sans table de plus.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_advertisers', function (Blueprint $table) {
            $table->foreignId('claimed_by_id')->nullable()
                ->constrained('users', 'id', 'radar_advertisers_claimed_by_fk')->nullOnDelete();
            $table->timestamp('claimed_at')->nullable();
            $table->timestamp('claim_expires_at')->nullable();
            $table->index('claimed_by_id', 'radar_advertisers_claimed_by_idx');
        });
    }

    public function down(): void
    {
        Schema::table('radar_advertisers', function (Blueprint $table) {
            $table->dropForeign('radar_advertisers_claimed_by_fk');
            $table->dropIndex('radar_advertisers_claimed_by_idx');
            $table->dropColumn(['claimed_by_id', 'claimed_at', 'claim_expires_at']);
        });
    }
};
