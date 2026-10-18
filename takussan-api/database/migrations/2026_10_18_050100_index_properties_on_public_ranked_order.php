<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-863 (P02.12) — l'ordre organique du catalogue public se lit par un index, sans tri.
 *
 * `PublicPropertyController::index()` trie sur `ranked_at DESC NULLS LAST, id DESC`.
 * `properties_ranked_at_idx` est en ASC (NULLS LAST) : parcouru à l'envers, il rend les NULL en
 * tête, et le moteur triait toutes les lignes publiques avant d'en garder une page (mesuré,
 * `Sort` top-N). Index partiel sur le prédicat stable de `scopePublic()` (`visibility`, `is_test`) ;
 * ajout d'index seul, sans réécriture de données.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            "CREATE INDEX properties_public_ranked_order_idx ON properties (ranked_at DESC NULLS LAST, id DESC) WHERE visibility = 'public' AND NOT is_test"
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS properties_public_ranked_order_idx');
    }
};
