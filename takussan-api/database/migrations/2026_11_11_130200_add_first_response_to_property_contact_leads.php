<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2583 (ADR-0103 § 1) — la première réponse d'une demande : l'instant, l'auteur et le canal du
 * PREMIER geste de contact fait depuis la console. Tenus par `ContactGestureService` seul ; un
 * geste ne marque pas la demande traitée (`handled_at` reste au geste explicite).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('property_contact_leads', function (Blueprint $table) {
            $table->timestamp('first_responded_at')->nullable();
            $table->foreignId('first_responded_by_id')->nullable()
                ->constrained('users', 'id', 'contact_leads_first_responded_by_fk')
                ->nullOnDelete();
            $table->string('first_response_channel', 16)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('property_contact_leads', function (Blueprint $table) {
            $table->dropForeign('contact_leads_first_responded_by_fk');
            $table->dropColumn(['first_responded_at', 'first_responded_by_id', 'first_response_channel']);
        });
    }
};
