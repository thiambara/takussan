<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2812 (ADR-0099, amendement du 2026-11-14) — l'archive PRÉPARÉE d'un dossier du coffre : une
 * ligne par préparation, son état, et le fichier qu'elle a écrit sur le disque des médias privés.
 *
 * L'index unique PARTIEL tient « une demande identique en cours n'en lance pas une seconde » en
 * base : un seul `pending` par (demandeur, profil, dossier). `NULLS NOT DISTINCT` (PostgreSQL 15+) :
 * sans lui, deux demandes sans profil actif (`profile_type` et `profile_id` nuls) ne se
 * heurteraient pas, NULL n'étant égal à rien.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_vault_archives', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            // Le profil actif de la demande, que le travail réinstalle : le coffre se juge sous lui.
            $table->string('profile_type', 120)->nullable();
            $table->unsignedBigInteger('profile_id')->nullable();
            // `receipts:2026`, `lease:22`… (DocumentVaultArchiveRequest::FORME : 25 caractères au plus).
            $table->string('folder', 40);
            // La langue de la demande : les noms des générés suivent celle de l'appelant.
            $table->string('locale', 8);
            $table->string('status', 16)->default('pending');
            $table->string('error_code', 80)->nullable();
            $table->string('disk', 40)->nullable();
            $table->string('path', 255)->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->unsignedInteger('entries_count')->nullable();
            $table->timestampTz('expires_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
            $table->index('expires_at');
        });

        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX document_vault_archives_one_pending
            ON document_vault_archives (user_id, folder, profile_type, profile_id) NULLS NOT DISTINCT
            WHERE status = 'pending'
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS document_vault_archives_one_pending');

        Schema::dropIfExists('document_vault_archives');
    }
};
