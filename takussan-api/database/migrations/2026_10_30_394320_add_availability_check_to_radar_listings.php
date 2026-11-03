<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2432 — la question posée au titulaire d'un bien publié par le Radar quand sa source a disparu (`RadarAvailabilityCheck`).
 *
 * - `availability_asked_at` : le marqueur de la disparition en cours — la question est posée (ou couverte par celle d'une
 *   autre source du même bien). Posé par un `UPDATE … WHERE availability_asked_at IS NULL` : une notification par
 *   disparition, même sous course. Remis à null, avec les quatre suivantes, quand l'annonce revient (`RadarSourceWatch`).
 * - `availability_answer` : `rented`, `sold` ou `available` — la réponse du titulaire ; `availability_answered_at`, `_by_id`.
 * - `withdrawal_proposed_at` : sans réponse au délai, la proposition de retrait faite à l'équipe (jamais un retrait).
 *
 * Aucune donnée de l'annonceur : la purge (TCK-2391) n'y touche pas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_listings', function (Blueprint $table) {
            $table->timestamp('availability_asked_at')->nullable();
            $table->string('availability_answer', 16)->nullable();
            $table->timestamp('availability_answered_at')->nullable();
            $table->foreignId('availability_answered_by_id')->nullable()->constrained('users', 'id', 'radar_listings_avail_answered_by_fk')->nullOnDelete();
            $table->timestamp('withdrawal_proposed_at')->nullable();
            $table->index('availability_asked_at', 'radar_listings_avail_asked_at_idx');
            $table->index('availability_answered_by_id', 'radar_listings_avail_answered_by_idx');
        });
    }

    public function down(): void
    {
        Schema::table('radar_listings', function (Blueprint $table) {
            $table->dropForeign('radar_listings_avail_answered_by_fk');
            $table->dropIndex('radar_listings_avail_answered_by_idx');
            $table->dropIndex('radar_listings_avail_asked_at_idx');
            $table->dropColumn(['availability_asked_at', 'availability_answer', 'availability_answered_at', 'availability_answered_by_id', 'withdrawal_proposed_at']);
        });
    }
};
