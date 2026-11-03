<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2436 (ADR-0081, amendement du 2026-10-30) — le jeton opaque posé à chaque envoi par l'API du Radar
 * (`biz_opaque_callback_data`), que Meta rend dans ses accusés : il apparie EXACTEMENT un envoi resté ambigu sans
 * identifiant (délai, 5xx). Aléatoire, sans donnée personnelle. L'index unique partiel fait d'un jeton une ligne au plus.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_outreaches', function (Blueprint $table) {
            $table->string('provider_callback_token', 64)->nullable();
        });

        DB::statement('CREATE UNIQUE INDEX radar_outreaches_provider_callback_unique ON radar_outreaches (provider_callback_token) WHERE provider_callback_token IS NOT NULL');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS radar_outreaches_provider_callback_unique');

        Schema::table('radar_outreaches', function (Blueprint $table) {
            $table->dropColumn('provider_callback_token');
        });
    }
};
