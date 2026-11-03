<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2448 (ADR-0085 §1, ADR-0086) — le catalogue des modèles réglé depuis la console. Une ligne
 * l'emporte sur `config('ai.pricing')` pour le même couple. Les tarifs, en dollars par million de
 * tokens, sont en `numeric` sans précision : aucun nombre de décimales n'est choisi pour de l'argent IA.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_models', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 40);
            $table->string('model', 255);
            $table->rawColumn('input', 'numeric');
            $table->rawColumn('output', 'numeric');
            $table->rawColumn('cache_read', 'numeric');
            $table->rawColumn('cache_write', 'numeric');
            $table->boolean('active')->default(true);
            $table->foreignId('updated_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['provider', 'model']);
        });

        DB::statement('ALTER TABLE ai_models ADD CONSTRAINT ai_models_prices_non_negative CHECK ("input" >= 0 AND "output" >= 0 AND cache_read >= 0 AND cache_write >= 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_models');
    }
};
