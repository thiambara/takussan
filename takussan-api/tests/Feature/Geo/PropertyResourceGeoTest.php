<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\Tag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** TCK-633 — les champs de `PropertyResource` dont le formulaire du bien a besoin. */
class PropertyResourceGeoTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_fiche_porte_les_identifiants_du_referentiel_le_type_d_agence_et_le_statut_des_equipements(): void
    {
        $agence = Agency::factory()->individual()->create();
        $ville = GeoCity::factory()->create(['slug' => 'dakar', 'name' => 'Dakar']);
        $quartier = GeoNeighborhood::factory()->for($ville, 'city')->create(['slug' => 'mermoz', 'name' => 'Mermoz']);
        $bien = Property::factory()->published()->create(['agency_id' => $agence->id]);
        Address::factory()->create([
            'addressable_type' => Property::class, 'addressable_id' => $bien->id,
            'geo_city_id' => $ville->id, 'geo_neighborhood_id' => $quartier->id,
            'city' => 'Dakar', 'neighborhood' => 'Mermoz',
        ]);
        // Le cas réel : la proposition de l'annonceur, rattachée par lui — seule forme qu'une fiche
        // publique montre avant modération (`Tag::scopeVisiblesSurUneFiche`, D9).
        $puits = Tag::factory()->create(['name' => 'Puits', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => $bien->user_id]);
        $bien->tags()->attach($puits->id, ['attached_by_id' => $bien->user_id]);

        $this->getJson("/api/public/properties/{$bien->slug}")
            ->assertOk()
            ->assertJsonPath('data.location.geo_city_id', $ville->id)
            ->assertJsonPath('data.location.geo_neighborhood_id', $quartier->id)
            ->assertJsonPath('data.location.quarter', 'Mermoz')
            ->assertJsonPath('data.agency.kind', 'individual')
            ->assertJsonPath('data.tags.0.status', 'pending');
    }
}
