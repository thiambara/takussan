<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2388 (ADR-0077 §3) — une réponse d'annonceur déposée : la preuve, son verdict IA, et la confirmation
 * humaine qui seule la rend valide.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('radar_consents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('radar_outreach_id')->constrained('radar_outreaches', 'id', 'radar_consents_outreach_fk')->restrictOnDelete();
            // Dénormalisé : « les accords de l'annonceur » (fiche, TCK-2389) sans passer par les messages.
            $table->foreignId('radar_advertiser_id')->constrained('radar_advertisers', 'id', 'radar_consents_advertiser_fk')->restrictOnDelete();
            $table->string('proof', 30);
            $table->jsonb('capture_hashes')->default('[]');
            $table->string('provider_message_id', 120)->nullable();
            $table->text('transcript')->nullable();
            $table->jsonb('ai_verdict')->nullable();
            $table->string('verification_status', 20)->default('pending');
            $table->string('verification_reason', 60)->nullable();
            $table->foreignId('deposited_by_id')->nullable()->constrained('users', 'id', 'radar_consents_deposited_by_fk')->nullOnDelete();
            // Un accord n'est valide qu'une fois confirmé par un humain (ADR-0077 §3) : ces deux colonnes, posées ensemble
            // par `RadarConsentWorkflow::recordOutcome()` et par lui seul.
            $table->foreignId('confirmed_by_id')->nullable()->constrained('users', 'id', 'radar_consents_confirmed_by_fk')->nullOnDelete();
            $table->timestamp('confirmed_at')->nullable();
            $table->text('confirmation_reason')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->index('radar_outreach_id', 'radar_consents_outreach_idx');
            $table->index('radar_advertiser_id', 'radar_consents_advertiser_idx');
            $table->index('deposited_by_id', 'radar_consents_deposited_by_idx');
            $table->index('confirmed_by_id', 'radar_consents_confirmed_by_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('radar_consents');
    }
};
