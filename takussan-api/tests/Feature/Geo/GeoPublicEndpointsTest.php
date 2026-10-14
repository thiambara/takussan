<?php

namespace Tests\Feature\Geo;

use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\GeoRegion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-633 — les listes du référentiel, lues sans compte par le formulaire et par la recherche
 * (lot E). Une proposition de quartier n'apparaît qu'à son auteur ; un refusé et un fusionné, à
 * personne.
 */
class GeoPublicEndpointsTest extends TestCase
{
    use RefreshDatabase;

    private GeoRegion $dakar;

    private GeoCity $ville;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dakar = GeoRegion::factory()->create(['code' => 'SN-DK', 'slug' => 'dakar', 'name' => 'Dakar']);
        GeoRegion::factory()->create(['code' => 'SN-TH', 'slug' => 'thies', 'name' => 'Thiès']);
        $this->ville = GeoCity::factory()->for($this->dakar, 'region')->create(['slug' => 'dakar', 'name' => 'Dakar', 'latitude' => 14.721548, 'longitude' => -17.4728141]);
        GeoCity::factory()->for($this->dakar, 'region')->create(['slug' => 'guediawaye', 'name' => 'Guédiawaye']);
        GeoNeighborhood::factory()->for($this->ville, 'city')->create(['slug' => 'mermoz', 'name' => 'Mermoz']);
        GeoNeighborhood::factory()->for($this->ville, 'city')->create(['slug' => 'liberte-4', 'name' => 'Liberté 4']);
    }

    public function test_les_regions_triees_par_nom(): void
    {
        $this->getJson('/api/public/geo/regions')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Dakar')
            ->assertJsonPath('data.1.name', 'Thiès')
            ->assertJsonStructure(['data' => [['id', 'name', 'slug']]]);
    }

    public function test_les_villes_d_une_region_et_leur_centre(): void
    {
        $this->getJson("/api/public/geo/cities?region={$this->dakar->id}")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Dakar')
            ->assertJsonPath('data.0.region_id', $this->dakar->id)
            ->assertJsonPath('data.0.latitude', 14.721548)
            ->assertJsonPath('data.1.name', 'Guédiawaye');
    }

    public function test_une_ville_seule_donne_sa_region(): void
    {
        $this->getJson("/api/public/geo/cities/{$this->ville->id}")
            ->assertOk()
            ->assertJsonPath('data.region_id', $this->dakar->id)
            ->assertJsonPath('data.slug', 'dakar');
    }

    public function test_les_quartiers_exigent_leur_ville(): void
    {
        $this->getJson('/api/public/geo/neighborhoods')->assertUnprocessable()->assertJsonValidationErrors('city');
    }

    public function test_un_anonyme_ne_voit_que_les_quartiers_approuves(): void
    {
        $auteur = User::factory()->create();
        GeoNeighborhood::factory()->for($this->ville, 'city')->pending($auteur)->create(['slug' => 'cite-x', 'name' => 'Cité X']);
        GeoNeighborhood::factory()->for($this->ville, 'city')->rejected()->create(['slug' => 'fass', 'name' => 'Fass']);

        $noms = collect($this->getJson("/api/public/geo/neighborhoods?city={$this->ville->id}")->assertOk()->json('data'))->pluck('name')->all();

        $this->assertSame(['Liberté 4', 'Mermoz'], $noms);
    }

    public function test_l_auteur_voit_sa_proposition_et_pas_celle_des_autres(): void
    {
        $moi = User::factory()->create();
        $autre = User::factory()->create();
        GeoNeighborhood::factory()->for($this->ville, 'city')->pending($moi)->create(['slug' => 'cite-moi', 'name' => 'Cité Moi']);
        GeoNeighborhood::factory()->for($this->ville, 'city')->pending($autre)->create(['slug' => 'cite-autre', 'name' => 'Cité Autre']);
        Sanctum::actingAs($moi);

        $reponse = $this->getJson("/api/public/geo/neighborhoods?city={$this->ville->id}")->assertOk();

        $this->assertSame(['Cité Moi', 'Liberté 4', 'Mermoz'], collect($reponse->json('data'))->pluck('name')->all());
        $this->assertSame('pending', collect($reponse->json('data'))->firstWhere('name', 'Cité Moi')['status']);
    }

    public function test_un_quartier_fusionne_disparait_de_la_liste(): void
    {
        $cible = GeoNeighborhood::query()->where('slug', 'mermoz')->firstOrFail();
        GeoNeighborhood::factory()->for($this->ville, 'city')->create(['slug' => 'mermoz-bis', 'name' => 'Mermoz Bis', 'merged_into_id' => $cible->id]);

        $noms = collect($this->getJson("/api/public/geo/neighborhoods?city={$this->ville->id}")->assertOk()->json('data'))->pluck('name')->all();

        // La cible reste : sans elle, une liste vide (ou une 404) passerait l'assertion négative.
        $this->assertContains('Mermoz', $noms);
        $this->assertNotContains('Mermoz Bis', $noms);
    }

    /** Interface D → E (addendum du plan maître) : sans `region`, toutes les villes du pays. */
    public function test_sans_region_toutes_les_villes_du_pays(): void
    {
        $thies = GeoRegion::query()->where('code', 'SN-TH')->firstOrFail();
        GeoCity::factory()->for($thies, 'region')->create(['slug' => 'mbour', 'name' => 'Mbour']);

        $this->getJson('/api/public/geo/cities')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.name', 'Dakar')
            ->assertJsonPath('data.1.name', 'Guédiawaye')
            ->assertJsonPath('data.2.name', 'Mbour')
            ->assertJsonPath('data.2.region_id', $thies->id);
    }

    public function test_q_filtre_par_nom_sans_tenir_compte_de_la_casse(): void
    {
        // Encodé comme le ferait un navigateur : un « É » brut dans l'URL est mutilé par
        // `Request::create` (mesuré : `LIBERT�_`), et le test échouerait pour une autre raison.
        $this->getJson("/api/public/geo/neighborhoods?city={$this->ville->id}&q=".rawurlencode('LIBERTÉ'))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Liberté 4');
        $this->getJson('/api/public/geo/cities?q='.rawurlencode('guéd'))
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }
}
