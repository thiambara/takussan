<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2926 (ADR-0124) — la fiche d'un membre de l'équipe.
 *
 * - `last_login_device` : la famille d'appareil et de navigateur de la DERNIÈRE connexion
 *   (`iPhone · Safari`), jamais la chaîne `User-Agent` ;
 * - `last_login_city` : la ville seule de cette connexion, résolue hors ligne ; jamais l'IP ;
 * - `two_factor_enabled_at` : posée par le modèle `User` à l'activation, `null` à la désactivation.
 *   Les comptes déjà protégés gardent `null` : aucune date n'est inventée.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('last_login_device', 64)->nullable()->after('last_login_at');
            $table->string('last_login_city', 120)->nullable()->after('last_login_device');
            $table->timestamp('two_factor_enabled_at')->nullable()->after('two_factor_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['last_login_device', 'last_login_city', 'two_factor_enabled_at']);
        });
    }
};
