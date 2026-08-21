<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-032 P3 — per-agency threshold alerts (unpaid rate, vacancy, overdue…).
 *
 * A threshold alert fires when the metric identified by `metric` crosses
 * `threshold` in the direction of `operator` (> or <). The `scheduled job`
 * evaluates them and stamps `last_triggered_at` to avoid spamming users —
 * alerts re-fire only if the metric dipped below the threshold in between.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('threshold_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->string('metric');          // e.g. unpaid_rate_percent
            $table->string('operator', 3);     // '>' | '<'
            $table->decimal('threshold', 14, 4);
            $table->string('severity')->default('warning'); // info|warning|critical
            $table->boolean('is_enabled')->default(true);
            $table->timestamp('last_triggered_at')->nullable();
            $table->decimal('last_value', 14, 4)->nullable();
            $table->unsignedSmallInteger('cooldown_hours')->default(24);
            $table->jsonb('settings')->nullable();
            $table->timestamps();

            $table->index(['agency_id', 'is_enabled']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('threshold_alerts');
    }
};
