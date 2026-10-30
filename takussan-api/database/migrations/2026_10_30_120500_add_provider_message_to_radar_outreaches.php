<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2395 (ADR-0077 §3, §5) — le canal automatisé : l'identifiant que Meta rend pour un message envoyé par l'API
 * (`provider_message_id`, auquel une réponse se rattache par `context.id`) et l'état de cet envoi (`provider_status` :
 * `accepted`, ou `ambiguous` quand Meta a pu l'accepter sans le dire). Un identifiant reçu ne fait qu'une réponse :
 * l'index unique partiel de `radar_consents` rend le webhook idempotent quand Meta le rejoue.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_outreaches', function (Blueprint $table) {
            $table->string('provider_message_id', 120)->nullable();
            $table->string('provider_status', 20)->nullable();
        });

        DB::statement('CREATE UNIQUE INDEX radar_outreaches_provider_message_unique ON radar_outreaches (provider_message_id) WHERE provider_message_id IS NOT NULL');
        DB::statement('CREATE UNIQUE INDEX radar_consents_provider_message_unique ON radar_consents (provider_message_id) WHERE provider_message_id IS NOT NULL');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS radar_consents_provider_message_unique');
        DB::statement('DROP INDEX IF EXISTS radar_outreaches_provider_message_unique');

        Schema::table('radar_outreaches', function (Blueprint $table) {
            $table->dropColumn(['provider_message_id', 'provider_status']);
        });
    }
};
