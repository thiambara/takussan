<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-594 (ADR-0039 §6, VERIF-594 M-6) — la vérification d'une destination de paiement vaut PAR
 * AGENCE.
 *
 * `payout_methods.verified_at` était global : vérifiée par une agence, une destination servait à
 * payer depuis toute autre agence où le titulaire est bailleur — y compris depuis une petite agence
 * complaisante. Une ligne par `(agence, destination)` la remplace.
 *
 * Les vérifications existantes ne sont PAS migrées : elles sont invalidées. Choix délibéré — on ne
 * sait pas reconstituer l'agence au nom de laquelle le vérificateur agissait (un membre peut
 * appartenir à plusieurs), et la table `payout_methods` n'a jamais été déployée (TCK-594 n'a pas
 * quitté sa branche) : il n'y a rien à perdre ailleurs qu'en base de développement.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payout_method_verifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('agency_id')->constrained('agencies', 'id', 'pm_verifications_agency_fk')->cascadeOnDelete();
            $table->foreignId('payout_method_id')->constrained('payout_methods', 'id', 'pm_verifications_method_fk')->cascadeOnDelete();
            $table->foreignId('verified_by_id')->nullable()->constrained('users', 'id', 'pm_verifications_verifier_fk')->nullOnDelete();
            $table->timestamp('verified_at');
            $table->timestamps();

            $table->unique(['agency_id', 'payout_method_id'], 'pm_verifications_agency_method_unique');
            // Piège PostgreSQL n° 8 : la FK n'indexe pas. Une destination modifiée efface TOUTES ses
            // vérifications par cette colonne.
            $table->index('payout_method_id', 'pm_verifications_method_idx');
        });

        Schema::table('payout_methods', function (Blueprint $table) {
            $table->dropForeign('payout_methods_verified_by_fk');
            $table->dropColumn(['verified_at', 'verified_by_id']);
        });
    }

    public function down(): void
    {
        Schema::table('payout_methods', function (Blueprint $table) {
            $table->timestamp('verified_at')->nullable();
            $table->foreignId('verified_by_id')->nullable()->constrained('users', 'id', 'payout_methods_verified_by_fk')->nullOnDelete();
        });

        // La vérification redevient globale : la plus récente de chaque destination, quelle que soit
        // l'agence.
        DB::statement(<<<'SQL'
            UPDATE payout_methods pm
            SET verified_at = v.verified_at, verified_by_id = v.verified_by_id
            FROM (
                SELECT DISTINCT ON (payout_method_id) payout_method_id, verified_at, verified_by_id
                FROM payout_method_verifications
                ORDER BY payout_method_id, verified_at DESC
            ) v
            WHERE v.payout_method_id = pm.id
            SQL);

        Schema::dropIfExists('payout_method_verifications');
    }
};
