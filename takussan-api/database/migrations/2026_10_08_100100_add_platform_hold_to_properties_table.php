<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-597 (ADR-0043 §4) — le verrou que seule la plateforme lève.
 *
 * Posé quand un super-admin masque ou supprime une annonce sur signalement. Tant qu'il l'est,
 * `PropertyObserver::updating` refuse toute sauvegarde qui rendrait le bien public, quel que soit
 * le chemin. Seule l'approbation d'un super-admin l'efface.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->timestamp('platform_hold_at')->nullable()->after('rejected_by_user_id');
            $table->unsignedBigInteger('platform_hold_by_id')->nullable()->after('platform_hold_at');
            $table->foreign('platform_hold_by_id', 'properties_platform_hold_by_fk')
                ->references('id')->on('users')->nullOnDelete();
            $table->string('platform_hold_reason')->nullable()->after('platform_hold_by_id');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->dropForeign('properties_platform_hold_by_fk');
            $table->dropColumn(['platform_hold_at', 'platform_hold_by_id', 'platform_hold_reason']);
        });
    }
};
