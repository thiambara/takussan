<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-586 — le courtier quitte le code et la base (ADR-0030, qui remplace
 * ADR-0027). Les migrations de création (`2026_05_02_000003`,
 * `2026_05_02_000005`) restent : l'historique ne se réécrit pas.
 *
 * Ordre : la table de collaboration d'abord, elle porte la clé étrangère vers
 * celle des profils.
 *
 * ⚠ `down()` recrée les deux tables **VIDES**, au schéma d'origine —
 * contraintes et noms d'index compris. Il ne rend aucune ligne : il n'y en
 * avait aucune qui ne soit une fixture (aucun chemin applicatif n'a jamais
 * créé de profil courtier). C'est un `down()` juste pour ce qu'il peut
 * promettre, et rien de plus.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('broker_agency_collaborations');
        Schema::dropIfExists('broker_profiles');
    }

    public function down(): void
    {
        Schema::create('broker_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('users')->restrictOnDelete();
            $table->string('license_number')->unique();
            $table->string('insurance_policy_id')->nullable();
            $table->string('regulator_registration')->nullable();
            $table->date('active_until')->nullable();
            $table->jsonb('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index('deleted_at');
        });

        Schema::create('broker_agency_collaborations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('broker_profile_id')->constrained('broker_profiles')->cascadeOnDelete();
            $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
            $table->string('status')->default('active');
            $table->date('started_at');
            $table->date('ended_at')->nullable();
            $table->jsonb('metadata')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->unique(['broker_profile_id', 'agency_id'], 'broker_agency_collab_unique');
            $table->index(['agency_id', 'status']);
            $table->index('deleted_at');
        });
    }
};
