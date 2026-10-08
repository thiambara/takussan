<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-586 — le courtier quitte le code et la base (ADR-0030).
 *
 * Supprime les relations client de type `broker_client`. Elle passe AVANT le
 * retrait du cas d'énumération : une ligne laissée en base ferait lever
 * `ValueError` au cast de `UserCustomerRelationship::relationship_type`.
 *
 * Aucune ligne réelle n'est perdue : l'API n'écrit que `agent_client`
 * (`CustomerController`), seules les fixtures du seeder CRM écrivaient
 * `broker_client`, et l'API n'a jamais servi en production.
 *
 * `down()` est vide, délibérément : on ne recrée pas des fixtures, et le cas
 * d'énumération qui les lirait n'existe plus.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('user_customer_relationships')
            ->where('relationship_type', 'broker_client')
            ->delete();
    }

    public function down(): void
    {
        // Rien à recréer : voir le docblock.
    }
};
