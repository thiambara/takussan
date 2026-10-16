<?php

namespace Tests\Feature\Tags;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-712 (P02.05) — les suggestions d'étiquettes CRM de la fiche client.
 *
 * `fetchCrmTags` (takussan-web/src/lib/queries/customers.ts) demandait `sort=-usage_count`, qu'aucun
 * tri autorisé ne portait, et `fields[tags]=…,usage_count`, qui n'est pas une colonne : 400, masqué
 * côté front par `.catch(() => [])`. Les suggestions étaient toujours vides.
 */
class TagCrmSuggestionsTest extends TestCase
{
    use RefreshDatabase;

    /** La requête exacte de `fetchCrmTags`, une fois le correctif posé. */
    private const REQUETE_FRONT = '/api/tags?filter[type]=crm&fields[tags]=id,name,color&sort=-usage_count&per_page=50';

    private Agency $agenceA;

    private Agency $agenceB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agenceA = Agency::factory()->create();
        $this->agenceB = Agency::factory()->create();
    }

    private function agentDeA(): User
    {
        $user = User::factory()->create(['agency_id' => $this->agenceA->id]);
        $this->materializeRoleProfile($user, 'agent', $this->agenceA);

        return $user;
    }

    private function porteePar(Tag $tag, Agency $agence, int $clients): void
    {
        for ($i = 0; $i < $clients; $i++) {
            Customer::factory()->create(['agency_id' => $agence->id])->tags()->attach($tag);
        }
    }

    public function test_les_suggestions_crm_sont_triees_par_usage_dans_l_agence(): void
    {
        // « Rare ici » est la plus portée tous comptes confondus (1 + 4), mais la moins portée dans
        // l'agence A : un tri sur le compte global la mettrait en tête.
        $rare = Tag::factory()->create(['name' => 'Rare ici', 'type' => TagType::Crm]);
        $frequente = Tag::factory()->create(['name' => 'Fréquente', 'type' => TagType::Crm]);
        $moyenne = Tag::factory()->create(['name' => 'Moyenne', 'type' => TagType::Crm]);
        $this->porteePar($rare, $this->agenceA, 1);
        $this->porteePar($rare, $this->agenceB, 4);
        $this->porteePar($frequente, $this->agenceA, 3);
        $this->porteePar($moyenne, $this->agenceA, 2);

        Sanctum::actingAs($this->agentDeA());

        $data = $this->getJson(self::REQUETE_FRONT)->assertOk()->json('data');

        $this->assertSame(['Fréquente', 'Moyenne', 'Rare ici'], array_column($data, 'name'));
        $this->assertSame([3, 2, 1], array_column($data, 'usage_count'));

        $croissant = $this->getJson(str_replace('sort=-usage_count', 'sort=usage_count', self::REQUETE_FRONT))
            ->assertOk()->json('data');
        $this->assertSame(['Rare ici', 'Moyenne', 'Fréquente'], array_column($croissant, 'name'));
    }

    public function test_la_liste_ne_recompte_pas_les_biens_etiquette_par_etiquette(): void
    {
        for ($i = 0; $i < 4; $i++) {
            $tag = Tag::factory()->create(['name' => "Équipement {$i}", 'type' => TagType::Amenity]);
            Property::factory()->create()->tags()->attach($tag);
        }

        Sanctum::actingAs($this->agentDeA());

        foreach (['', '&fields[tags]=id,name'] as $champs) {
            $comptes = 0;
            DB::listen(function (QueryExecuted $q) use (&$comptes): void {
                if (preg_match('/^select count\(\*\) as "aggregate" from "properties"/', $q->sql)) {
                    $comptes++;
                }
            });

            $data = $this->getJson('/api/tags?filter[type]=amenity&per_page=50'.$champs)->assertOk()->json('data');

            $this->assertCount(4, $data);
            $this->assertSame([1, 1, 1, 1], array_column($data, 'properties_count'), "champs : '{$champs}'");
            $this->assertSame(0, $comptes, "comptes de biens par étiquette, champs : '{$champs}'");
            DB::flushQueryLog();
            app('events')->forget(QueryExecuted::class);
        }
    }
}
