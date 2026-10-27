<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2383 (ADR-0076 §5) — le journal de chaque passage par la passerelle : réussite, cache,
 * bascule, erreur ou refus. Aucun contenu envoyé ni reçu n'y est conservé : seulement de quoi
 * compter, budgéter et attribuer.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_calls', function (Blueprint $table) {
            $table->id();
            $table->string('usage_key', 80);
            $table->string('role', 20)->nullable();
            $table->string('provider', 40)->nullable();
            $table->string('model', 80)->nullable();
            $table->unsignedSmallInteger('prompt_version')->nullable();
            $table->unsignedInteger('input_tokens')->default(0);
            $table->unsignedInteger('output_tokens')->default(0);
            $table->unsignedInteger('cache_read_tokens')->default(0);
            $table->unsignedInteger('cache_write_tokens')->default(0);
            $table->decimal('cost_estimate', 14, 2)->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->string('outcome', 20);
            $table->string('refusal_reason', 30)->nullable();
            $table->string('error_code', 80)->nullable();
            $table->string('warning', 40)->nullable();
            $table->boolean('is_evaluation')->default(false);
            $table->foreignId('agency_id')->nullable()->constrained('agencies')->nullOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->nullableMorphs('subject', 'ai_calls_subject_idx');
            $table->timestamp('created_at')->nullable();

            $table->index(['usage_key', 'created_at'], 'ai_calls_usage_created_idx');
            $table->index(['agency_id', 'created_at'], 'ai_calls_agency_created_idx');
            $table->index('created_at', 'ai_calls_created_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_calls');
    }
};
