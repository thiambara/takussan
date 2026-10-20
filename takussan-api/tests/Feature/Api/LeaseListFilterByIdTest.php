<?php

namespace Tests\Feature\Api;

use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1067 (P60.03) — un `show` rend la ressource de détail entière ; une lecture légère d'un bail
 * passe par la LISTE filtrée par id, avec ses `fields[leases]`. C'est ainsi que la fiche de bail
 * lit le seul numéro de son titre d'onglet.
 */
class LeaseListFilterByIdTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_liste_filtree_par_id_rend_le_seul_bail_demande(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create(['landlord_id' => $landlord->id, 'reference_number' => 'BAIL-0042']);
        Lease::factory()->create(['landlord_id' => $landlord->id]);

        Sanctum::actingAs($landlord);

        $this->getJson("/api/leases?filter[id]={$lease->id}&fields[leases]=id,reference_number&per_page=1")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $lease->id)
            ->assertJsonPath('data.0.reference_number', 'BAIL-0042');
    }

    public function test_le_filtre_garde_le_perimetre_de_la_liste(): void
    {
        $tiers = Lease::factory()->create();
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/leases?filter[id]={$tiers->id}&fields[leases]=id,reference_number")
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_un_id_illisible_rend_400_et_non_500(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/leases?filter[id]=abc')->assertStatus(400);
    }
}
