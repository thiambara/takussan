<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-251 — Tracks which welcome modales a user has already seen.
 *
 * One row per `(user_id, key)` — the unique constraint guarantees a
 * welcome modale fires at most once per user, even under concurrent
 * "seen" calls. `key` is a logical identifier owned by the consumer
 * modale (e.g. `customer-welcome`, `host-welcome`, `tenant-welcome`).
 *
 * No `created_at/updated_at` — only `seen_at` is meaningful here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('welcome_views', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('key', 64);
            $table->timestamp('seen_at');

            $table->unique(['user_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('welcome_views');
    }
};
