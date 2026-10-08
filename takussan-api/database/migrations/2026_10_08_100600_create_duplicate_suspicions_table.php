<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-597 (ADR-0054 §5) — une paire de biens soupçonnés d'être la même annonce, remise à la file de
 * la plateforme.
 *
 * `property_id` est le bien soupçonné (celui dont la photo ou l'adresse vient d'être examinée),
 * `matched_property_id` celui qu'il recopie. Une ligne par PAIRE, quel que soit l'ordre :
 * l'index unique porte `LEAST`/`GREATEST`, et l'écriture passe par `insertOrIgnore`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('duplicate_suspicions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained('properties', 'id', 'duplicate_suspicions_property_fk')->cascadeOnDelete();
            $table->foreignId('matched_property_id')->constrained('properties', 'id', 'duplicate_suspicions_matched_fk')->cascadeOnDelete();
            $table->string('signal', 20);
            $table->unsignedSmallInteger('distance')->nullable();
            $table->string('decision', 20)->nullable();
            $table->foreignId('resolved_by_id')->nullable()->constrained('users', 'id', 'duplicate_suspicions_resolved_by_fk')->nullOnDelete();
            $table->string('reason_code', 40)->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['resolved_at', 'created_at'], 'duplicate_suspicions_open_idx');
            $table->index('matched_property_id', 'duplicate_suspicions_matched_idx');
        });

        DB::statement('CREATE UNIQUE INDEX duplicate_suspicions_pair_uniq ON duplicate_suspicions (LEAST(property_id, matched_property_id), GREATEST(property_id, matched_property_id))');
    }

    public function down(): void
    {
        Schema::dropIfExists('duplicate_suspicions');
    }
};
