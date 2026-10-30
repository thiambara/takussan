<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2394 (ADR-0077, lot 4 ; ADR-0079) — sur la ligne de l'annonceur, sans table de plus :
 *  - la relance d'activation : la dernière envoyée, leur nombre, et la ligne de base des vues (`{bien: views_count}` au
 *    dernier envoi), d'où la relance suivante tire les vues de SA période — `views_count` n'est qu'un compteur cumulé ;
 *  - la publication sous mandat (ADR-0079) : quand, et par quel opérateur, pour la première fois.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_advertisers', function (Blueprint $table) {
            $table->timestamp('activation_reminded_at')->nullable();
            $table->unsignedSmallInteger('activation_reminder_count')->default(0);
            $table->jsonb('activation_baseline')->nullable();
            $table->timestamp('mandate_at')->nullable();
            $table->foreignId('mandate_by_id')->nullable()
                ->constrained('users', 'id', 'radar_advertisers_mandate_by_fk')->nullOnDelete();
            $table->index('mandate_by_id', 'radar_advertisers_mandate_by_idx');
        });
    }

    public function down(): void
    {
        Schema::table('radar_advertisers', function (Blueprint $table) {
            $table->dropForeign('radar_advertisers_mandate_by_fk');
            $table->dropIndex('radar_advertisers_mandate_by_idx');
            $table->dropColumn(['activation_reminded_at', 'activation_reminder_count', 'activation_baseline', 'mandate_at', 'mandate_by_id']);
        });
    }
};
