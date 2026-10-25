<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-1000 (P15.06, Q2 ; ADR-0036, amendement du 2026-10-19, voie 2) — le bien saisi pour un bailleur
 * INVITÉ porte le profil `draft` de l'invitation. `user_id` reste l'auteur jusqu'à l'acceptation ;
 * l'invitation révoquée ou expirée remet la colonne à nul.
 *
 * Additive et nullable, SANS reprise de données (décision du porteur du 2026-10-25) : aucun bien
 * existant ne gagne de bailleur en attente, et aucun `user_id` n'est réécrit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table): void {
            $table->foreignId('pending_owner_profile_id')->nullable()
                ->constrained('owner_profiles', 'id', 'properties_pending_owner_profile_fk')->nullOnDelete();
            $table->index('pending_owner_profile_id', 'properties_pending_owner_profile_idx');
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table): void {
            $table->dropForeign('properties_pending_owner_profile_fk');
            $table->dropIndex('properties_pending_owner_profile_idx');
            $table->dropColumn('pending_owner_profile_id');
        });
    }
};
