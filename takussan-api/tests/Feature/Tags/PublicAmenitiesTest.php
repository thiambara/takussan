<?php

namespace Tests\Feature\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-633 (addendum du plan maître, interface D → E) — le catalogue APPROUVÉ des équipements, lu
 * sans compte par le panneau de filtres de la recherche publique.
 *
 * `/api/tags` exige un compte et sert aussi les propositions de l'appelant : il ne convient pas à
 * une page publique. Ici, ni proposition (même la sienne : un filtre public ne doit pas proposer
 * un équipement que personne d'autre ne voit), ni refus, ni étiquette CRM.
 */
class PublicAmenitiesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Tag::factory()->create(['name' => 'Piscine', 'slug' => 'piscine', 'type' => TagType::Amenity]);
        Tag::factory()->create(['name' => 'Climatisation', 'slug' => 'climatisation', 'type' => TagType::Amenity]);
        Tag::factory()->create(['name' => 'Écran géant', 'slug' => 'ecran-geant', 'type' => TagType::Amenity]);
        Tag::factory()->create(['name' => 'VIP', 'slug' => 'vip', 'type' => TagType::Crm]);
        Tag::factory()->create(['name' => 'Garage', 'slug' => 'garage', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Rejected]);
    }

    public function test_un_anonyme_lit_les_equipements_approuves_tries_par_nom(): void
    {
        $this->getJson('/api/public/amenities')
            ->assertOk()
            ->assertExactJsonStructure(['data' => ['*' => ['id', 'name', 'slug']]])
            ->assertJsonPath('data.*.name', ['Climatisation', 'Écran géant', 'Piscine']);
    }

    public function test_une_proposition_n_y_figure_pas_meme_pour_son_auteur(): void
    {
        $auteur = User::factory()->create();
        Tag::factory()->create(['name' => 'Puits', 'slug' => 'puits', 'type' => TagType::Amenity, 'status' => ReferentialStatus::Pending, 'created_by_id' => $auteur->id]);
        Sanctum::actingAs($auteur);

        $noms = collect($this->getJson('/api/public/amenities')->assertOk()->json('data'))->pluck('name')->all();

        $this->assertContains('Piscine', $noms);
        $this->assertNotContains('Puits', $noms);
    }

    public function test_un_ancien_feature_non_migre_n_y_figure_pas(): void
    {
        Tag::factory()->create(['name' => 'Cheminée', 'slug' => 'cheminee', 'type' => TagType::Feature]);

        $noms = collect($this->getJson('/api/public/amenities')->assertOk()->json('data'))->pluck('name')->all();

        $this->assertNotContains('Cheminée', $noms);
        $this->assertCount(3, $noms);
    }
}
