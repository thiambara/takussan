<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (AC5) — la file des quartiers proposés : approuver, refuser, renommer, fusionner. Un
 * refus détache les adresses sans effacer leur texte ; un renommage et une fusion RÉÉCRIVENT le
 * texte des adresses, parce que c'est lui qu'affichent les fiches et qu'indexe la recherche.
 */
class GeoNeighborhoodModerationTest extends TestCase
{
    use RefreshDatabase;

    private GeoCity $ville;

    private User $auteur;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ville = GeoCity::factory()->create(['slug' => 'dakar', 'name' => 'Dakar']);
        $this->auteur = User::factory()->create();
    }

    private function proposition(string $nom, string $slug): GeoNeighborhood
    {
        return GeoNeighborhood::factory()->for($this->ville, 'city')->pending($this->auteur)->create(['name' => $nom, 'slug' => $slug]);
    }

    private function adresseSur(GeoNeighborhood $quartier): Address
    {
        return Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => Property::factory()->create()->id,
            'geo_city_id' => $this->ville->id,
            'geo_neighborhood_id' => $quartier->id,
            'city' => 'Dakar',
            'neighborhood' => $quartier->name,
        ]);
    }

    public function test_un_agent_n_entre_pas_dans_la_file(): void
    {
        $this->actingAsRole('agent');
        $q = $this->proposition('Cité X', 'cite-x');

        $this->getJson('/api/admin/geo/neighborhoods')->assertForbidden();
        $this->postJson("/api/admin/geo/neighborhoods/{$q->id}/approve")->assertForbidden();
    }

    public function test_la_file_liste_les_propositions_avec_leur_auteur_et_leur_usage(): void
    {
        $this->actingAsRole('super_admin');
        $q = $this->proposition('Cité X', 'cite-x');
        GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Mermoz', 'slug' => 'mermoz']);
        $this->adresseSur($q);

        $this->getJson('/api/admin/geo/neighborhoods?filter[status]=pending')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Cité X')
            ->assertJsonPath('data.0.city.name', 'Dakar')
            ->assertJsonPath('data.0.created_by.id', $this->auteur->id)
            ->assertJsonPath('data.0.addresses_count', 1)
            ->assertJsonPath('meta.total', 1);
    }

    public function test_approuver_puis_reapprouver(): void
    {
        $this->actingAsRole('super_admin');
        $q = $this->proposition('Cité X', 'cite-x');

        $this->postJson("/api/admin/geo/neighborhoods/{$q->id}/approve")->assertOk()->assertJsonPath('data.status', 'approved');
        $this->postJson("/api/admin/geo/neighborhoods/{$q->id}/approve")->assertStatus(409)->assertJsonPath('code', 'geo.neighborhood_not_pending');
    }

    public function test_refuser_detache_les_adresses_et_garde_leur_texte(): void
    {
        $this->actingAsRole('super_admin');
        $q = $this->proposition('Cité X', 'cite-x');
        $adresse = $this->adresseSur($q);

        $this->postJson("/api/admin/geo/neighborhoods/{$q->id}/reject")->assertOk()->assertJsonPath('data.status', 'rejected');

        $relue = $adresse->refresh();
        $this->assertNull($relue->geo_neighborhood_id);
        $this->assertSame('Cité X', $relue->neighborhood);
    }

    public function test_renommer_reecrit_les_adresses_et_se_marque(): void
    {
        $this->actingAsRole('super_admin');
        $q = $this->proposition('Cite x', 'cite-x');
        $adresse = $this->adresseSur($q);

        $this->patchJson("/api/admin/geo/neighborhoods/{$q->id}", ['name' => 'Cité X'])->assertOk()->assertJsonPath('data.name', 'Cité X');

        $this->assertNotNull($q->refresh()->renamed_at);
        $this->assertSame('Cité X', $adresse->refresh()->neighborhood);
        $this->assertSame($q->id, $adresse->geo_neighborhood_id);
    }

    public function test_renommer_vers_un_nom_pris_est_refuse(): void
    {
        $this->actingAsRole('super_admin');
        GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Mermoz', 'slug' => 'mermoz']);
        $q = $this->proposition('Mermos', 'mermos');

        $this->patchJson("/api/admin/geo/neighborhoods/{$q->id}", ['name' => 'MERMOZ'])->assertStatus(409)->assertJsonPath('code', 'geo.name_taken');
    }

    public function test_fusionner_deplace_les_adresses_vers_la_cible(): void
    {
        $this->actingAsRole('super_admin');
        $cible = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Liberté 4', 'slug' => 'liberte-4']);
        $source = $this->proposition('Liberte Quatre', 'liberte-quatre');
        $ancienne = GeoNeighborhood::factory()->for($this->ville, 'city')->create(['name' => 'Lib 4', 'slug' => 'lib-4', 'merged_into_id' => $source->id]);
        $adresse = $this->adresseSur($source);

        $this->postJson("/api/admin/geo/neighborhoods/{$source->id}/merge", ['into_id' => $cible->id])->assertOk();

        $this->assertSame($cible->id, $source->refresh()->merged_into_id);
        $this->assertSame($cible->id, $ancienne->refresh()->merged_into_id);
        $relue = $adresse->refresh();
        $this->assertSame($cible->id, $relue->geo_neighborhood_id);
        $this->assertSame('Liberté 4', $relue->neighborhood);
    }

    public function test_les_fusions_impossibles(): void
    {
        $this->actingAsRole('super_admin');
        $q = $this->proposition('Cité X', 'cite-x');
        $ailleurs = GeoNeighborhood::factory()->create(['name' => 'Randoulène', 'slug' => 'randoulene']);
        $refuse = GeoNeighborhood::factory()->for($this->ville, 'city')->rejected()->create(['name' => 'Fass', 'slug' => 'fass']);

        $this->postJson("/api/admin/geo/neighborhoods/{$q->id}/merge", ['into_id' => $q->id])->assertUnprocessable()->assertJsonPath('code', 'geo.merge_into_self');
        $this->postJson("/api/admin/geo/neighborhoods/{$q->id}/merge", ['into_id' => $ailleurs->id])->assertUnprocessable()->assertJsonPath('code', 'geo.merge_other_city');
        $this->postJson("/api/admin/geo/neighborhoods/{$q->id}/merge", ['into_id' => $refuse->id])->assertUnprocessable()->assertJsonPath('code', 'geo.merge_target_inactive');
        $this->assertSame(ReferentialStatus::Pending, $q->refresh()->status);
    }
}
