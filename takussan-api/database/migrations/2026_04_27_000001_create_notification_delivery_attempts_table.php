<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-110 — Normalised SMS delivery attempts. Replaces the
 * `app_notifications.delivery_attempts` JSON column introduced by
 * TCK-102. The unique `(provider, provider_message_id)` index makes
 * DLR webhook lookups O(1) and removes the substring ambiguity that
 * a naive `LIKE '%…%'` lookup had on the JSON column.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_delivery_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('app_notification_id')
                ->constrained('app_notifications')
                ->cascadeOnDelete();
            $table->unsignedSmallInteger('attempt');
            $table->string('provider');
            $table->string('provider_message_id')->nullable();
            $table->string('to')->nullable();
            $table->string('status');
            $table->string('failure_reason')->nullable();
            $table->decimal('cost_estimate', 10, 4)->nullable();
            $table->unsignedSmallInteger('segments_count')->nullable();
            $table->dateTime('sent_at')->nullable();
            $table->dateTime('delivered_at')->nullable();
            $table->timestamps();

            $table->index(['app_notification_id', 'attempt']);
            // The (provider, provider_message_id) pair is what DLR
            // webhooks look up. Provider-side ids are unique within a
            // provider; making the index unique guarantees one DLR can
            // only match one attempt — no substring collisions.
            $table->unique(['provider', 'provider_message_id'], 'ndo_provider_message_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_delivery_attempts');
    }
};
