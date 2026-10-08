<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-595 (ADR-0057) — un instantané par jour des métriques de la console plateforme.
 *
 * Les flux (`gmv_amount`, `platform_fees_amount`, `collected_total_amount`) se rattrapent depuis
 * `paid_at`. Les stocks non : un statut courant ne dit pas ce qu'il était hier. Ils restent `null`
 * sur une ligne rattrapée, et `stocks_captured_at` dit quand ils ont été mesurés.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_metrics_daily', function (Blueprint $table) {
            $table->id();
            $table->date('date');
            $table->decimal('gmv_amount', 16, 2)->default(0);
            $table->decimal('platform_fees_amount', 16, 2)->default(0);
            $table->decimal('collected_total_amount', 16, 2)->default(0);
            $table->decimal('mrr_amount', 16, 2)->nullable();
            $table->decimal('mrr_trialing_amount', 16, 2)->nullable();
            $table->unsignedInteger('active_subscriptions')->nullable();
            $table->unsignedInteger('agencies_total')->nullable();
            $table->unsignedInteger('agencies_active')->nullable();
            $table->unsignedInteger('agencies_verified')->nullable();
            $table->unsignedInteger('agencies_suspended')->nullable();
            $table->unsignedInteger('users_total')->nullable();
            $table->unsignedInteger('users_active')->nullable();
            $table->unsignedInteger('properties_published')->nullable();
            $table->unsignedInteger('properties_pending_review')->nullable();
            $table->unsignedInteger('leases_active')->nullable();
            $table->timestamp('stocks_captured_at')->nullable();
            $table->timestamps();

            $table->unique('date', 'platform_metrics_daily_date_uq');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_metrics_daily');
    }
};
