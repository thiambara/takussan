<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-602 (ADR-0051 §7, dette D-52) — le jeton d'un lien de partage de document ne vit plus en
 * clair : `token_hash` (sha256, unique) pour la recherche, `token` chiffré pour la relecture par
 * qui gère le document. Les liens EXISTANTS sont hachés et chiffrés ici : un lien déjà envoyé
 * reste valide.
 *
 * `down()` rétablit la colonne en clair, en déchiffrant — c'est le seul chemin de retour qui ne
 * casse pas les liens envoyés entre-temps.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('document_share_links', function (Blueprint $table): void {
            $table->char('token_hash', 64)->nullable();
        });
        Schema::table('document_share_links', function (Blueprint $table): void {
            $table->dropUnique('document_share_links_token_unique');
        });
        DB::statement('ALTER TABLE document_share_links ALTER COLUMN token TYPE text');

        DB::table('document_share_links')->orderBy('id')->select(['id', 'token'])->chunkById(500, function ($rows): void {
            foreach ($rows as $row) {
                DB::table('document_share_links')->where('id', $row->id)->update([
                    'token_hash' => hash('sha256', (string) $row->token),
                    'token' => Crypt::encryptString((string) $row->token),
                ]);
            }
        });

        DB::statement('ALTER TABLE document_share_links ALTER COLUMN token_hash SET NOT NULL');
        Schema::table('document_share_links', function (Blueprint $table): void {
            $table->unique('token_hash', 'dsl_token_hash_unique');
        });
    }

    public function down(): void
    {
        DB::table('document_share_links')->orderBy('id')->select(['id', 'token'])->chunkById(500, function ($rows): void {
            foreach ($rows as $row) {
                DB::table('document_share_links')->where('id', $row->id)->update([
                    'token' => Crypt::decryptString((string) $row->token),
                ]);
            }
        });

        Schema::table('document_share_links', function (Blueprint $table): void {
            $table->dropUnique('dsl_token_hash_unique');
            $table->dropColumn('token_hash');
        });
        DB::statement('ALTER TABLE document_share_links ALTER COLUMN token TYPE varchar(255)');
        Schema::table('document_share_links', function (Blueprint $table): void {
            $table->unique('token', 'document_share_links_token_unique');
        });
    }
};
