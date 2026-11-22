<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-537 (AC1) — la PREUVE du consentement, que la politique de confidentialité (§ 6) promet de
 * garder « le temps du consentement, puis 5 ans ». `users.terms_accepted_at`/`terms_version` (TCK-633)
 * ne portent qu'une date écrasée à chaque acceptation, sans document ni adresse : ils ne prouvent
 * rien de ce qui a été accepté avant.
 *
 * Une ligne par document accepté et par geste — ajout seul, jamais modifiée :
 *  - `document` : `terms` (conditions générales) ou `privacy` (politique de confidentialité) ;
 *  - `version` : la version en vigueur, `PublishReadiness::TERMS_VERSION`, reflet de
 *    `VERSION_DOCUMENTS` (front), gardé égal par `scripts/check-terms-version.mjs` ;
 *  - `context` : le geste qui l'a recueillie (`register`, `host_onboarding`, `offer`, `publish`,
 *    `phone_login`, `radar_claim`) ;
 *  - `ip_address`, `accepted_at`.
 *
 * `user_id` est nul à la suppression d'une ligne `users` (`nullOnDelete`) : un compte effacé n'est
 * qu'anonymisé et gardé en `deleted_at`, et la preuve lui survit ; elle part 5 ans après
 * (`account:prune-consent-proofs`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consent_proofs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('document', 20);
            $table->string('version', 20);
            $table->string('context', 40);
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('accepted_at');
            $table->timestamps();

            $table->index(['user_id', 'document'], 'consent_proofs_user_document_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consent_proofs');
    }
};
