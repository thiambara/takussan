<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2519 — l'adresse d'une fiche `/agents/{slug}` dit qui l'on va voir (`sokhna-gueye`), plus le
 * `username` technique (`dakar-immo-owner-4`). Nullable : `null` tant que le compte n'a pas de
 * fiche publique, qui se résout alors par `username` comme avant.
 *
 * Unique sous la collation déterministe de la base (`--locale=C`) : le slug est TOUJOURS en
 * minuscules ASCII (`PublicSlugService`), donc deux casses d'un même nom ne peuvent pas coexister.
 * Le remplissage des fiches existantes est la commande `users:public-slugs`, idempotente.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('public_slug', 120)->nullable()->unique();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['public_slug']);
            $table->dropColumn('public_slug');
        });
    }
};
