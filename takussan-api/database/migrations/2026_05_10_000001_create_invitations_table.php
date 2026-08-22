<?php

use App\Models\Enums\InvitationStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-249 — Pattern d'invitation unifié.
 *
 * Modèle générique partagé par tous les parcours d'onboarding par invitation
 * (Owner, Agent, AgencyAdmin, ServiceProvider, super-admin coopté). Voir
 * `docs/models-spec.md#48-invitation-` pour la référence canonique.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invitations', function (Blueprint $table): void {
            $table->id();
            // 64-char URL-safe token (Str::random(64)). Unique to make the
            // accept URL unguessable + DB-level dedup.
            $table->string('token', 64)->unique();
            $table->string('email');
            // User cible si déjà existant en base ; rempli par le service
            // au moment de l'envoi quand l'email matche un User connu, sinon
            // rempli à l'acceptation après création du User.
            $table->foreignId('invited_user_id')->nullable()
                ->constrained('users')->nullOnDelete();
            $table->foreignId('invited_by')
                ->constrained('users')->cascadeOnDelete();
            // Polymorphic target profile (pré-créé en `draft` par le caller).
            $table->string('invitable_type')->nullable();
            $table->unsignedBigInteger('invitable_id')->nullable();
            // Optional agency scope — null pour cooptation super-admin.
            $table->foreignId('agency_id')->nullable()
                ->constrained('agencies')->cascadeOnDelete();
            // Spatie role à assigner à l'acceptation (e.g. owner, agent,
            // agency_admin, service_provider, super_admin).
            $table->string('role');
            $table->string('status')->default(InvitationStatus::Sent->value);
            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamp('last_reminded_at')->nullable();
            $table->jsonb('metadata')->nullable();
            $table->timestamps();

            // Indexes (voir spec §48):
            // - token unique (cf. ->unique() above)
            // - (email, status) pour rechercher les invitations en cours
            //   pour un email
            $table->index(['email', 'status']);
            // - (invitable_type, invitable_id) pour le morphTo
            $table->index(['invitable_type', 'invitable_id']);
            // - (status, expires_at) pour le cron d'expiration
            $table->index(['status', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invitations');
    }
};
