<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2985 (ADR-0132 § 6) — la trace du résumé du lundi : un par (bailleur, agence, semaine ISO). L'index unique est
 * l'idempotence de `owners:weekly-digest` : relancée la même semaine, la commande n'envoie rien de plus.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('owner_weekly_digests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            // La semaine résumée, `o-\WW` (ISO), lundi 00:00 → dimanche 23:59 heure de Dakar.
            $table->string('week', 8);
            // Le canal effectif : l'identifiant d'un pilote du pont, ou `mail`.
            $table->string('channel', 32)->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'agency_id', 'week']);
            $table->index('agency_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('owner_weekly_digests');
    }
};
