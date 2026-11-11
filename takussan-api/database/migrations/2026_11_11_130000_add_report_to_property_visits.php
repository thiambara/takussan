<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2578 (ADR-0101 § 2) — le compte rendu de visite de l'agence, distinct de l'avis du visiteur
 * (`metadata.feedback_*`, fenêtre de 24 h, inchangé) : verdict, objections en liste fermée, note
 * libre, suite choisie, auteur et date. Codes en `string` + contrôle applicatif (ADR-0007), liste
 * en `jsonb` (piège n° 4). `down()` retire tout, données comprises.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('property_visits', function (Blueprint $table) {
            $table->string('report_outcome', 16)->nullable();
            $table->jsonb('report_objections')->nullable();
            $table->text('report_note')->nullable();
            $table->string('report_follow_up', 24)->nullable();
            $table->timestamp('reported_at')->nullable();
            $table->foreignId('reported_by_id')->nullable()
                ->constrained('users', 'id', 'property_visits_reported_by_fk')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('property_visits', function (Blueprint $table) {
            $table->dropForeign('property_visits_reported_by_fk');
            $table->dropColumn([
                'report_outcome', 'report_objections', 'report_note', 'report_follow_up',
                'reported_at', 'reported_by_id',
            ]);
        });
    }
};
