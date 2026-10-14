<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 lot F (ADR-0061 §5, §7) — `ranked_at` porte l'ordre organique (une Remontée le remet à
 * maintenant) ; `sponsored_until`, `badge`, `badge_until` sont des PROJECTIONS des boosts actifs,
 * écrites par `App\Services\Boost\BoostLifecycle` seul.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->timestamp('ranked_at')->nullable();
            $table->timestamp('sponsored_until')->nullable();
            $table->string('badge', 20)->nullable();
            $table->timestamp('badge_until')->nullable();
            $table->index('ranked_at', 'properties_ranked_at_idx');
        });

        DB::table('properties')->whereNull('ranked_at')->whereNotNull('published_at')
            ->update(['ranked_at' => DB::raw('published_at')]);
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropIndex('properties_ranked_at_idx');
            $table->dropColumn(['ranked_at', 'sponsored_until', 'badge', 'badge_until']);
        });
    }
};
