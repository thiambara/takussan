<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 (lot C) — le drapeau `host_auto_space` naît ALLUMÉ (ticket, « Création automatique »).
 *
 * `insertOrIgnore` (ON CONFLICT DO NOTHING) : une ligne déjà posée par la console garde l'état
 * qu'un opérateur lui a donné — on ne rallume pas un drapeau qu'il a éteint. On teste par la
 * contrainte d'unicité de `key` sans jamais lever d'exception (piège PostgreSQL n° 1).
 * `label` est NOT NULL : la console y écrit la clé (`FeatureFlagController::update`), on fait de même.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('feature_flags')->insertOrIgnore([
            'key' => 'host_auto_space',
            'label' => 'host_auto_space',
            'description' => null,
            'enabled' => true,
            'segments_json' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Ne retire que la ligne que `up()` a posée et que personne n'a touchée depuis : la console
     * écrit `updated_by_id` à chaque bascule (`FeatureFlagController::update`). Une ligne posée ou
     * réglée par un opérateur — avant cette migration, que `insertOrIgnore` n'a donc pas écrasée,
     * ou après — reste telle qu'il l'a laissée (vérification adverse du lot C).
     */
    public function down(): void
    {
        DB::table('feature_flags')
            ->where('key', 'host_auto_space')
            ->whereNull('updated_by_id')
            ->delete();
    }
};
