<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2524 — la vitrine de l'agence nomme les biens de sa sélection par leurs ids
 * (`GET /api/properties?filter[id]=…`), pas par la page courante de la liste : un bien choisi au-delà
 * des cent premiers se nomme quand même. Même patron que les baux (`LeaseListFilterByIdTest`).
 */
class PropertyListFilterByIdTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_liste_filtree_par_ids_rend_ces_biens_et_eux_seuls(): void
    {
        $agence = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency_id' => $agence->id]);
        [$a, $b, $c] = Property::factory()->count(3)->create(['agency_id' => $agence->id]);

        $ids = collect($this->getJson("/api/properties?filter[id]={$c->id},{$a->id}&fields[properties]=id,title&per_page=100")
            ->assertOk()
            ->json('data'))->pluck('id')->sort()->values()->all();

        $this->assertSame(collect([$a->id, $c->id])->sort()->values()->all(), $ids);
        $this->assertNotContains($b->id, $ids);
    }

    public function test_le_filtre_garde_le_perimetre_de_la_liste(): void
    {
        $agence = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency_id' => $agence->id]);
        $tiers = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);

        $this->getJson("/api/properties?filter[id]={$tiers->id}&fields[properties]=id,title")
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_un_id_illisible_rend_400_et_non_500(): void
    {
        $this->actingAsRole('agency_admin', ['agency_id' => Agency::factory()->create()->id]);

        $this->getJson('/api/properties?filter[id]=abc')->assertStatus(400);
    }
}
