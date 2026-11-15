<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2887 (ADR-0121) — la copie chiffrée du jeton d'un lien d'agenda, pour le rendre à son
 * titulaire à la réouverture. Chiffrée par le cast `encrypted` (clé de l'application) ; la
 * vérification reste par `token_hash`. Les liens antérieurs n'ont pas de copie (`null`) : un jeton
 * non conservé ne se rattrape pas depuis son empreinte.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('calendar_feeds', function (Blueprint $table) {
            $table->text('token_encrypted')->nullable()->after('token_hash');
        });
    }

    public function down(): void
    {
        Schema::table('calendar_feeds', function (Blueprint $table) {
            $table->dropColumn('token_encrypted');
        });
    }
};
