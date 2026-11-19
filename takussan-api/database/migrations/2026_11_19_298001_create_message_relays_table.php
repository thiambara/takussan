<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2980 (ADR-0132 § 1, § 4) — la trace de chaque passage par le pont : un message reçu (`direction = in`), un
 * relais, une invitation, un lien d'action ou un résumé envoyés (`out`, TCK-2981, TCK-2982, TCK-2985).
 *
 * - `channel` : l'identifiant du pilote (`whatsapp`, `sms`…), une chaîne libre (ADR-0132 § 0, ADR-0007).
 * - `phone` : E.164, **nullable** — la tâche `pont:effacer-numeros` l'efface 90 jours après l'envoi (ADR-0132 § 4,
 *   « Rétention ») ; la ligne reste pour la trace. Rendu par aucune ressource.
 * - L'index unique partiel `(channel, provider_message_id)` rend le webhook idempotent quand le fournisseur rejoue
 *   (Meta le fait) ; le verrou par numéro de `PontEntrant` passe avant, l'index est le dernier recours.
 * - `(phone, business_number_id, direction, created_at)` : le dernier relais vers un numéro (routage, § 2) et la
 *   fenêtre de 24 h par numéro d'entreprise (`ServiceWindow::isOpenFor`).
 * - `agency_id` a son propre index (garde `AgencyIdIsIndexedTest`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('message_relays', function (Blueprint $table) {
            $table->id();
            $table->string('purpose', 20);
            $table->string('direction', 3);
            $table->foreignId('message_id')->nullable()->constrained('messages')->cascadeOnDelete();
            $table->foreignId('conversation_id')->nullable()->constrained('conversations')->nullOnDelete();
            $table->foreignId('agency_id')->nullable()->index()->constrained('agencies')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('property_contact_lead_id')->nullable()->constrained('property_contact_leads')->nullOnDelete();
            $table->string('channel', 20)->nullable(); // TCK-2981 — nul : rien n'a pu partir (aucun canal).
            $table->string('form', 20)->nullable();
            $table->string('template', 100)->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('business_number_id', 64)->nullable();
            $table->string('provider_message_id', 128)->nullable();
            $table->string('status', 20);
            $table->string('failure_reason', 255)->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamps();

            $table->index(['phone', 'business_number_id', 'direction', 'created_at'], 'message_relays_phone_business_idx');
            $table->index(['conversation_id', 'user_id'], 'message_relays_conversation_user_idx');
            $table->index('message_id', 'message_relays_message_idx');
            $table->index('property_contact_lead_id', 'message_relays_lead_idx');
        });

        DB::statement('CREATE UNIQUE INDEX message_relays_provider_message_unique ON message_relays (channel, provider_message_id) WHERE provider_message_id IS NOT NULL');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS message_relays_provider_message_unique');
        Schema::dropIfExists('message_relays');
    }
};
