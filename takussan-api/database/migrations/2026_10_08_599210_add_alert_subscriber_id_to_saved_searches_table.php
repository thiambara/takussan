<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-599 (ADR-0050 §4) — une recherche appartient à un compte OU à un abonné sans compte,
 * jamais aux deux ni à personne : la contrainte `CHECK` le tient en base, pas l'application.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('saved_searches', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->change();
            $table->foreignId('alert_subscriber_id')->nullable()->after('user_id')
                ->constrained('alert_subscribers', 'id', 'saved_searches_alert_subscriber_fk')
                ->cascadeOnDelete();
            $table->index('alert_subscriber_id', 'saved_searches_alert_subscriber_idx');
        });

        DB::statement('ALTER TABLE saved_searches ADD CONSTRAINT saved_searches_one_owner_chk '
            .'CHECK ((user_id IS NULL) <> (alert_subscriber_id IS NULL))');
    }

    /** Les recherches d'abonnés sans compte n'ont pas de propriétaire possible avant : effacées. */
    public function down(): void
    {
        DB::statement('ALTER TABLE saved_searches DROP CONSTRAINT IF EXISTS saved_searches_one_owner_chk');
        DB::table('saved_searches')->whereNull('user_id')->delete();

        Schema::table('saved_searches', function (Blueprint $table) {
            $table->dropForeign('saved_searches_alert_subscriber_fk');
            $table->dropIndex('saved_searches_alert_subscriber_idx');
            $table->dropColumn('alert_subscriber_id');
            $table->foreignId('user_id')->nullable(false)->change();
        });
    }
};
