<?php

namespace Tests\Feature\Database;

use App\Models\Property;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * TCK-863 (P02.12) — l'ordre organique du catalogue public se lit par un index, sans tri.
 *
 * `PublicPropertyController::index()` trie sur `ranked_at DESC NULLS LAST, id DESC`. L'index
 * `properties_ranked_at_idx` est en ASC (NULLS LAST) : parcouru à l'envers, il rend les NULL en
 * tête, et le moteur trie donc toutes les lignes publiques avant d'en garder 20.
 */
class PublicCatalogueRankedOrderIndexTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_partial_index_follows_the_public_order(): void
    {
        $index = collect(Schema::getIndexes('properties'))
            ->firstWhere('name', 'properties_public_ranked_order_idx');

        $this->assertNotNull($index, 'index partiel (ranked_at desc nulls last, id desc) absent');
        $this->assertSame(['ranked_at', 'id'], $index['columns']);
    }

    public function test_the_public_list_is_read_without_a_sort(): void
    {
        Property::factory()->count(30)->published()->create();

        $requete = null;
        DB::listen(function (QueryExecuted $q) use (&$requete): void {
            if ($requete === null && Str::contains($q->sql, 'ranked_at DESC NULLS LAST')) {
                $requete = [$q->sql, $q->bindings];
            }
        });

        $this->getJson('/api/public/properties')->assertOk();
        $this->assertNotNull($requete, 'la requête de la liste publique n\'a pas été vue');

        // La table de test est minuscule : sans cela, le moteur la balaierait quel que soit l'index.
        DB::statement('SET LOCAL enable_seqscan = off');
        $plan = collect(DB::select('EXPLAIN '.$requete[0], $requete[1]))->pluck('QUERY PLAN')->implode("\n");

        $this->assertStringContainsString('properties_public_ranked_order_idx', $plan);
        $this->assertStringNotContainsString('Sort', $plan);
    }
}
