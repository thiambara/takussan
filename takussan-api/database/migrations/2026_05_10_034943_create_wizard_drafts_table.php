<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-250 — Persists in-progress multi-step wizard state per user.
 *
 * Backbone for resumable onboarding flows (host individual, KYC owner,
 * KYC agent, customer onboarding, …). Strictly user-scoped via the unique
 * `(user_id, key)` constraint — wizards never share drafts across users.
 *
 * The `data` JSON column is opaque to the backend: each consumer wizard
 * defines its own schema. By contract, drafts MUST NOT contain sensitive
 * data (passwords, tokens) — see TCK-250 strict business constraints.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wizard_drafts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('key');
            $table->unsignedSmallInteger('step')->default(0);
            $table->jsonb('data')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'key']);
            $table->index('updated_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wizard_drafts');
    }
};
