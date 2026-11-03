<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2383 (ADR-0076 §4, §5) — les réglages d'un usage depuis la console : le coupe-circuit
 * (`enabled`), le modèle forcé et le plafond journalier. Une table et non un drapeau de
 * fonctionnalité : le catalogue `Flag` est fermé, et une clé hors catalogue y vaut faux.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_usage_settings', function (Blueprint $table) {
            $table->id();
            $table->string('usage_key', 80)->unique();
            $table->boolean('enabled')->default(true);
            $table->string('forced_provider', 40)->nullable();
            $table->string('forced_model', 80)->nullable();
            $table->decimal('daily_budget_xof', 14, 2)->nullable();
            $table->foreignId('updated_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_usage_settings');
    }
};
