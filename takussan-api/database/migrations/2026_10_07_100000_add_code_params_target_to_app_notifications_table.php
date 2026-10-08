<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-588 (ADR-0032) — une notification est un CODE, des paramètres bruts et une cible.
 *
 * `title` et `body` restent : ils sont rendus à l'écriture dans la langue du destinataire et
 * servent de repli à une ligne sans code (les 29 classes `Notification`, les lignes anciennes).
 * Le texte affiché, lui, est rendu à la lecture à partir de `code` + `params`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('app_notifications', function (Blueprint $table) {
            $table->string('code', 100)->nullable()->after('type');
            $table->jsonb('params')->nullable()->after('code');
            $table->jsonb('target')->nullable()->after('params');
        });
    }

    public function down(): void
    {
        Schema::table('app_notifications', function (Blueprint $table) {
            $table->dropColumn(['code', 'params', 'target']);
        });
    }
};
