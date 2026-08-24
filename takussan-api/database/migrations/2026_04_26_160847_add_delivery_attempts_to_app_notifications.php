<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-102 — Track every send attempt of a notification across the SMS
 * provider fallback chain. Each entry captures provider, status
 * (sent / failed / delivered / deferred_to_fallback), provider message id,
 * cost estimate and segment count so support can audit any number/run.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_notifications', function (Blueprint $table) {
            $table->jsonb('delivery_attempts')->nullable()->after('data');
        });
    }

    public function down(): void
    {
        Schema::table('app_notifications', function (Blueprint $table) {
            $table->dropColumn('delivery_attempts');
        });
    }
};
