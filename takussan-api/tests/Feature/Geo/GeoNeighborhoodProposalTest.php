<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\GeoNeighborhoodOrigin;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\GeoRegion;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 (AC5, ADR-0062 §4) — un quartier saisi se replie sur l'existant, ou devient une
 * proposition visible de son seul auteur ; un nom refusé ne se repropose pas ; un nom fusionné
 * retombe sur sa cible ; la ville référencée impose ses noms officiels et le pays.
 *
 * Chaque assertion porte sur la ligne RELUE en base : la canonisation vit dans le crochet `saving`
 * d'`Address`, et un crochet absent ne produit pas d'erreur, il produit un 201 parfaitement vert.
 */
class GeoNeighborhoodProposalTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private GeoCity $dakar;

    private GeoNeighborhood $liberte4;

    protected function setUp(): void
    {
        parent::setUp();
        $region = GeoRegion::factory()->create(['code' => 'SN-DK', 'slug' => 'dakar', 'name' => 'Dakar']);
        $this->dakar = GeoCity::factory()->for($region, 'region')->create(['slug' => 'dakar', 'name' => 'Dakar']);
        $this->liberte4 = GeoNeighborhood::factory()->for($this->dakar, 'city')->create(['slug' => 'liberte-4', 'name' => 'Liberté 4']);

        $this->agency = Agency::factory()->create(['moderation_required' => false]);
        $this->agent = $this->actingAsRole('agent', ['agency_id' => $this->agency->id]);
    }

    /** @param  array<string, mixed>  $adresse */
    private function creer(array $adresse): Address
    {
        $id = $this->postJson('/api/properties', [
            'title' => 'Appartement F3',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'rent_period' => 'monthly',
            'price' => 300_000,
            'agency_id' => $this->agency->id,
            'address' => $adresse,
        ])->assertCreated()->json('data.id');

        return Property::query()->findOrFail($id)->address()->firstOrFail();
    }

    public function test_un_quartier_inconnu_devient_une_proposition_de_son_auteur(): void
    {
        $adresse = $this->creer(['geo_city_id' => $this->dakar->id, 'city' => 'Dakar', 'neighborhood' => '  Cité  Djily Mbaye ']);

        $proposition = GeoNeighborhood::query()->where('name', 'Cité Djily Mbaye')->firstOrFail();
        $this->assertSame(ReferentialStatus::Pending, $proposition->status);
        $this->assertSame(GeoNeighborhoodOrigin::User, $proposition->origin);
        $this->assertSame($this->agent->id, $proposition->created_by_id);
        $this->assertSame($proposition->id, $adresse->geo_neighborhood_id);
        $this->assertSame('Cité Djily Mbaye', $adresse->neighborhood);
    }

    public function test_un_nom_existant_en_autre_casse_se_replie_sans_rien_creer(): void
    {
        $avant = GeoNeighborhood::query()->count();

        $adresse = $this->creer(['geo_city_id' => $this->dakar->id, 'city' => 'Dakar', 'neighborhood' => 'LIBERTÉ   4']);

        $this->assertSame($avant, GeoNeighborhood::query()->count());
        $this->assertSame($this->liberte4->id, $adresse->geo_neighborhood_id);
        $this->assertSame('Liberté 4', $adresse->neighborhood);
    }

    public function test_un_nom_refuse_ne_se_repropose_pas(): void
    {
        GeoNeighborhood::factory()->for($this->dakar, 'city')->rejected()->create(['slug' => 'fass', 'name' => 'Fass']);
        $avant = GeoNeighborhood::query()->count();

        $adresse = $this->creer(['geo_city_id' => $this->dakar->id, 'city' => 'Dakar', 'neighborhood' => 'fass']);

        $this->assertSame($avant, GeoNeighborhood::query()->count());
        $this->assertNull($adresse->geo_neighborhood_id);
        $this->assertSame('fass', $adresse->neighborhood);
    }

    public function test_un_nom_fusionne_retombe_sur_sa_cible(): void
    {
        $cible = GeoNeighborhood::factory()->for($this->dakar, 'city')->create(['slug' => 'colobane', 'name' => 'Colobane']);
        GeoNeighborhood::factory()->for($this->dakar, 'city')->create([
            'slug' => 'gueule-tapee', 'name' => 'Gueule Tapée', 'merged_into_id' => $cible->id,
        ]);

        $adresse = $this->creer(['geo_city_id' => $this->dakar->id, 'city' => 'Dakar', 'neighborhood' => 'gueule tapée']);

        $this->assertSame($cible->id, $adresse->geo_neighborhood_id);
        $this->assertSame('Colobane', $adresse->neighborhood);
    }

    public function test_la_proposition_d_un_autre_est_refusee_par_identifiant(): void
    {
        $autre = User::factory()->create();
        $sienne = GeoNeighborhood::factory()->for($this->dakar, 'city')->pending($autre)->create(['slug' => 'x', 'name' => 'Cité X']);

        $this->postJson('/api/properties', [
            'title' => 'Studio', 'type' => 'apartment', 'contract_type' => 'rent', 'price' => 100_000,
            'agency_id' => $this->agency->id,
            'address' => ['geo_city_id' => $this->dakar->id, 'city' => 'Dakar', 'geo_neighborhood_id' => $sienne->id],
        ])->assertUnprocessable()->assertJsonValidationErrors('address.geo_neighborhood_id');
    }

    public function test_sa_propre_proposition_est_admise_par_identifiant(): void
    {
        $mienne = GeoNeighborhood::factory()->for($this->dakar, 'city')->pending($this->agent)->create(['slug' => 'y', 'name' => 'Cité Y']);

        $adresse = $this->creer(['geo_city_id' => $this->dakar->id, 'city' => 'Dakar', 'geo_neighborhood_id' => $mienne->id]);

        $this->assertSame($mienne->id, $adresse->geo_neighborhood_id);
        $this->assertSame('Cité Y', $adresse->neighborhood);
    }

    public function test_un_quartier_d_une_autre_ville_est_refuse(): void
    {
        $thies = GeoCity::factory()->create(['slug' => 'thies', 'name' => 'Thiès']);
        $ailleurs = GeoNeighborhood::factory()->for($thies, 'city')->create(['slug' => 'randoulene', 'name' => 'Randoulène']);

        $this->postJson('/api/properties', [
            'title' => 'Studio', 'type' => 'apartment', 'contract_type' => 'rent', 'price' => 100_000,
            'agency_id' => $this->agency->id,
            'address' => ['geo_city_id' => $this->dakar->id, 'city' => 'Dakar', 'geo_neighborhood_id' => $ailleurs->id],
        ])->assertUnprocessable()->assertJsonValidationErrors('address.geo_neighborhood_id');
    }

    public function test_une_ville_en_texte_seul_se_rattache_et_impose_ses_noms_et_le_pays(): void
    {
        $adresse = $this->creer(['city' => 'dakar', 'region' => 'dkr', 'country' => 'FR', 'neighborhood' => 'liberté 4']);

        $this->assertSame($this->dakar->id, $adresse->geo_city_id);
        $this->assertSame('Dakar', $adresse->city);
        $this->assertSame('Dakar', $adresse->region);
        $this->assertSame('SN', $adresse->country);
        $this->assertSame($this->liberte4->id, $adresse->geo_neighborhood_id);
    }

    public function test_les_longueurs_d_adresse_sont_bornees(): void
    {
        $this->postJson('/api/properties', [
            'title' => 'Studio', 'type' => 'apartment', 'contract_type' => 'rent', 'price' => 100_000,
            'agency_id' => $this->agency->id,
            'address' => ['city' => str_repeat('a', 121), 'neighborhood' => str_repeat('b', 121)],
        ])->assertUnprocessable()->assertJsonValidationErrors(['address.city', 'address.neighborhood']);
    }
}
