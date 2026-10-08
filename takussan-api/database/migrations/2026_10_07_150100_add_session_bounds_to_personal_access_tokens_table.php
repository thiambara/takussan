<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-589 — bornes de session portées par le jeton.
 *
 *  - `idle_timeout_minutes` : inactivité tolérée pour CE jeton (7 j ; super-admin
 *    30 min). Nul sur un jeton émis avant le ticket : `AccessTokenGate` lui
 *    applique alors la borne de tout compte.
 *  - `two_factor_verified_at` : dernière confirmation TOTP faite AVEC ce jeton
 *    (step-up, 10 min). Portée par le jeton et non par l'utilisateur : une autre
 *    session du même compte n'en hérite pas.
 *
 * Colonnes nullables, sans défaut : l'ajout est gratuit sur une table peuplée.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            $table->smallInteger('idle_timeout_minutes')->nullable();
            $table->timestamp('two_factor_verified_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            $table->dropColumn(['idle_timeout_minutes', 'two_factor_verified_at']);
        });
    }
};
