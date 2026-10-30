<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2392 (ADR-0080, ADR-0077 §9) — la purge d'une annonce échue sans refus DÉTACHE ses instantanés : `radar_listing_id`
 * passe nullable, et `RadarPurger` le met à null (avec `crawl_run_id`, `title_fingerprint`, `neighborhood_label`, et les
 * dates ramenées au jour). Ne reste qu'une observation de marché anonyme — prix, quartier du référentiel, chambres,
 * surface, présence au jour — que l'observatoire (TCK-2393) peut lire. Pour un STOP, ils sont supprimés.
 *
 * La clé étrangère ne change pas (`cascadeOnDelete` vers `radar_listings`) : une ligne détachée n'a plus de parent à
 * suivre. `down()` rend la colonne obligatoire ; les instantanés détachés n'ont alors plus de place et sont SUPPRIMÉS
 * d'abord — c'est la seule forme que l'ancien schéma sait porter, et c'est ce que la purge aurait dû faire sous lui.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_listing_snapshots', function (Blueprint $table) {
            $table->unsignedBigInteger('radar_listing_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        DB::table('radar_listing_snapshots')->whereNull('radar_listing_id')->delete();

        Schema::table('radar_listing_snapshots', function (Blueprint $table) {
            $table->unsignedBigInteger('radar_listing_id')->nullable(false)->change();
        });
    }
};
