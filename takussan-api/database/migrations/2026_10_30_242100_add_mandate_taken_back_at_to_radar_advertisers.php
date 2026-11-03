<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-2421 (ADR-0079, amendement « la reprise ») — l'annonceur sous mandat qui vérifie son numéro reprend ses biens dans son
 * espace. `mandate_at` reste comme trace ; la reprise se date ici, et c'est elle qui clôt la période de mandat : sous mandat
 * = `mandate_at` posé ET `mandate_taken_back_at` nul (`RadarAdvertiser::underMandate()`). Une colonne et
 * non `user_id` : un compte délié après la reprise (`AdvertiserAccountRelease`) ne remet pas l'annonceur sous mandat.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('radar_advertisers', function (Blueprint $table) {
            $table->timestamp('mandate_taken_back_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('radar_advertisers', function (Blueprint $table) {
            $table->dropColumn('mandate_taken_back_at');
        });
    }
};
