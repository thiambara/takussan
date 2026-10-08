<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-596 §3B (ADR-0041) — un flux iCal externe importé pour un bien.
 *
 * `url` est en `text` : elle est chiffrée par le modèle (cast `encrypted`), elle porte souvent un
 * secret de la plateforme tierce, et son chiffré dépasse toute longueur de `string`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('property_calendar_feeds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained('properties', 'id', 'prop_cal_feeds_property_fk')->cascadeOnDelete();
            $table->text('url');
            $table->string('url_host', 255);
            $table->string('label', 120)->nullable();
            $table->foreignId('created_by_id')->nullable()->constrained('users', 'id', 'prop_cal_feeds_created_by_fk')->nullOnDelete();
            $table->timestamp('last_synced_at')->nullable();
            $table->string('last_status', 20)->nullable();
            $table->string('last_error', 60)->nullable();
            $table->timestamp('failing_since')->nullable();
            $table->unsignedInteger('consecutive_failures')->default(0);
            $table->timestamps();

            $table->index('property_id', 'prop_cal_feeds_property_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('property_calendar_feeds');
    }
};
