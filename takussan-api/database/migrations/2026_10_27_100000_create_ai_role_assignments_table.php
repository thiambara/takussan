<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2383 (ADR-0076 §2) — l'affectation d'un rôle de modèle à une chaîne ordonnée de maillons
 * `{provider, model, max_tokens}`, réglée depuis la console. Sans ligne, `config/ai.php` sert.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_role_assignments', function (Blueprint $table) {
            $table->id();
            $table->string('role', 20)->unique();
            $table->jsonb('chain');
            $table->foreignId('updated_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_role_assignments');
    }
};
