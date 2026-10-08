<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-597 (ADR-0043 §1, §3) — un avis porte l'agence qui le modère et la preuve qui l'a rendu
 * éligible.
 *
 * `agency_id` est le PÉRIMÈTRE de modération, figé à la création. Reprise : un avis de bien prend
 * l'agence du bien, un avis d'agence l'agence elle-même ; un avis sur un `User` reste `null` (aucun
 * contexte ne le rattache : il relève de la plateforme seule).
 *
 * L'index unique partiel porte `reviewable_type` en plus de ce que le ticket nommait : un même bail
 * rend éligible à noter le bien, l'agent et l'agence, et sans la cible dans la clé le formulaire
 * commun « bien + agent » se refuserait à lui-même (ADR-0043 §3). Noms explicites : PostgreSQL
 * tronque en silence au-delà de 63 caractères.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reviews', function (Blueprint $table) {
            $table->unsignedBigInteger('agency_id')->nullable()->after('author_id');
            $table->foreign('agency_id', 'reviews_agency_id_fk')->references('id')->on('agencies')->nullOnDelete();
            $table->string('context_type')->nullable()->after('agency_id');
            $table->unsignedBigInteger('context_id')->nullable()->after('context_type');
            $table->index(['agency_id', 'status'], 'reviews_agency_status_idx');
        });

        DB::statement('CREATE UNIQUE INDEX reviews_author_context_uniq ON reviews (author_id, reviewable_type, context_type, context_id) WHERE context_id IS NOT NULL');

        DB::statement(<<<'SQL'
            UPDATE reviews SET agency_id = properties.agency_id
            FROM properties
            WHERE reviews.reviewable_type = 'App\Models\Property' AND reviews.reviewable_id = properties.id
        SQL);
        DB::statement(<<<'SQL'
            UPDATE reviews SET agency_id = reviewable_id
            WHERE reviewable_type = 'App\Models\Agency'
              AND EXISTS (SELECT 1 FROM agencies WHERE agencies.id = reviews.reviewable_id)
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS reviews_author_context_uniq');

        Schema::table('reviews', function (Blueprint $table) {
            $table->dropIndex('reviews_agency_status_idx');
            $table->dropForeign('reviews_agency_id_fk');
            $table->dropColumn(['agency_id', 'context_type', 'context_id']);
        });
    }
};
