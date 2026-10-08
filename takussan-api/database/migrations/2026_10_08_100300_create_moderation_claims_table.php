<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-597 (ADR-0043 §7) — un modérateur PREND EN CHARGE un élément de la file pour 10 minutes.
 *
 * `item_key` est l'identifiant de la file (`property:12`, `property_report:3`, `review:7`) : une
 * ligne au plus par élément, l'unicité tranche deux prises simultanées. Une prise expirée ne protège
 * plus rien ; elle est réécrite par la suivante, jamais purgée par une tâche.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('moderation_claims', function (Blueprint $table) {
            $table->id();
            $table->string('item_key', 64)->unique('moderation_claims_item_key_uniq');
            $table->foreignId('claimed_by_id')->constrained('users', 'id', 'moderation_claims_claimed_by_fk')->cascadeOnDelete();
            $table->timestamp('claimed_at');
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('moderation_claims');
    }
};
