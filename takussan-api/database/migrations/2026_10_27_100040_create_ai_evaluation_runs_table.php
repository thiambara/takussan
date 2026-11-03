<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2385 (ADR-0076 §8) — l'évaluation d'un modèle candidat pour un rôle, lancée depuis la console
 * avant de l'affecter. Son verdict (`below_baseline`) commande le cliquet de l'affectation.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_evaluation_runs', function (Blueprint $table) {
            $table->id();
            $table->string('role', 20);
            $table->jsonb('candidate');
            $table->string('status', 20)->default('queued');
            $table->jsonb('report')->nullable();
            $table->boolean('below_baseline')->nullable();
            $table->string('error_code', 80)->nullable();
            $table->foreignId('requested_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['role', 'status'], 'ai_eval_runs_role_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_evaluation_runs');
    }
};
