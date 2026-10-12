<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-633 lot F, corrections après vérification adverse (ADR-0061 §3, §5).
 *
 * 1. `credit_welcome_grants.agency_id` UNIQUE : la bienvenue se verse une seule fois par ESPACE.
 *    L'unicité par empreinte de numéro (500200) reste : un numéro ne fait pas gagner deux espaces.
 *    Les deux se tiennent par `insertOrIgnore` (ON CONFLICT DO NOTHING, sans cible : toute
 *    contrainte d'unicité), jamais par une exception attrapée (piège PostgreSQL n°1). L'index sert
 *    aussi la clé étrangère, qui n'en avait pas (piège n°8). Plusieurs `NULL` y restent admis
 *    (espace supprimé : `ON DELETE SET NULL`) — PostgreSQL tient les NULL pour distincts.
 * 2. `property_boosts.price_credits` et `refunded_credits` : `unsignedInteger` n'est qu'un
 *    `integer` signé sous PostgreSQL ; la contrainte CHECK le dit enfin.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('credit_welcome_grants', function (Blueprint $table) {
            $table->unique('agency_id', 'credit_welcome_grants_agency_unique');
        });

        DB::statement('ALTER TABLE property_boosts ADD CONSTRAINT property_boosts_credits_check CHECK (price_credits >= 0 AND (refunded_credits IS NULL OR refunded_credits >= 0))');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE property_boosts DROP CONSTRAINT IF EXISTS property_boosts_credits_check');

        Schema::table('credit_welcome_grants', function (Blueprint $table) {
            $table->dropUnique('credit_welcome_grants_agency_unique');
        });
    }
};
