<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2384 (ADR-0076 §7) — une proposition de l'IA et la décision humaine qui la suit.
 * `input_snapshot` garde le contenu soumis, pour en faire un cas d'évaluation anonymisé
 * (`ai:export-eval-cases`) ; il s'efface avec son objet (purge du Radar, TCK-2391).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_suggestions', function (Blueprint $table) {
            $table->id();
            $table->string('usage_key', 80);
            $table->foreignId('ai_call_id')->nullable()->constrained('ai_calls')->nullOnDelete();
            $table->nullableMorphs('subject', 'ai_suggestions_subject_idx');
            $table->jsonb('proposal');
            $table->decimal('confidence', 4, 3)->nullable();
            $table->text('input_snapshot')->nullable();
            $table->string('decision', 20)->default('pending');
            $table->foreignId('decided_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->jsonb('final_value')->nullable();
            $table->jsonb('correction_diff')->nullable();
            $table->timestamps();

            $table->index(['usage_key', 'decision'], 'ai_suggestions_usage_decision_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_suggestions');
    }
};
