<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-032 P3 — per-agency KPI configuration.
 *
 * Each row declares a dashboard KPI an agency wants to track:
 *   - metric  : identifier picked from a whitelist (e.g. 'unpaid_rate_percent',
 *               'occupancy_rate_percent', 'revenue_month', 'overdue_count').
 *   - label   : display label shown on the dashboard card.
 *   - format  : how to format the metric value on the UI (percent, currency,
 *               number).
 *   - settings: extra JSON payload (target value, sort order, …).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kpi_configs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->string('metric');       // whitelisted metric key
            $table->string('label');
            $table->string('format')->default('number'); // number|percent|currency
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_enabled')->default(true);
            $table->jsonb('settings')->nullable();
            $table->timestamps();

            $table->unique(['agency_id', 'metric']);
            $table->index(['agency_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kpi_configs');
    }
};
