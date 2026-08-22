<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertyDetailTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_full_property_detail(): void
    {
        $property = Property::factory()->published()->create();

        $response = $this->getJson("/api/public/properties/{$property->slug}");

        $response->assertOk()
            ->assertJsonStructure([
                'data' => ['id', 'title', 'slug', 'price', 'type', 'location', 'bedrooms', 'area', 'description'],
            ]);
    }

    public function test_returns_404_for_unknown_slug(): void
    {
        $response = $this->getJson('/api/public/properties/slug-inexistant-xyz');
        $response->assertNotFound();
    }

    public function test_draft_property_returns_404(): void
    {
        $property = Property::factory()->draft()->create();

        $response = $this->getJson("/api/public/properties/{$property->slug}");
        $response->assertNotFound();
    }

    public function test_show_returns_enriched_public_detail(): void
    {
        $property = Property::factory()->published()->create();
        Address::factory()->create([
            'addressable_id' => $property->id,
            'addressable_type' => Property::class,
            'city' => 'Dakar',
            'region' => 'Dakar',
            // ⚠ 'SN' et non 'Sénégal' : `addresses.country` est un `string('country', 2)`,
            // un code ISO-3166 alpha-2, avec `SN` pour défaut. Ce test écrivait un nom de
            // pays de 7 caractères dans une colonne de 2, et il n'était vert que parce que
            // SQLite N'APPLIQUE AUCUNE longueur de VARCHAR. PostgreSQL la refuse
            // (« value too long for type character varying(2) »), et MySQL 8 en mode strict
            // l'aurait refusée aussi — la production n'ayant jamais servi, personne ne l'a
            // découvert. Le test assertait donc un comportement que le schéma interdit.
            'country' => 'SN',
            'neighborhood' => 'Almadies',
            'latitude' => 14.7444,
            'longitude' => -17.5167,
        ]);
        $tag = Tag::factory()->create(['type' => TagType::Amenity]);
        $property->tags()->attach($tag);
        $property->reviews()->create([
            'author_id' => User::factory()->create()->id,
            'rating' => 5,
            'is_approved' => true,
            'approved_at' => now(),
        ]);

        $response = $this->getJson("/api/public/properties/{$property->slug}");

        $response->assertOk()->assertJsonStructure([
            'data' => [
                'id', 'reference_number',
                'type', 'type_label',
                'contract_type', 'contract_type_label',
                'status', 'status_label',
                'title_type_label',
                'location' => ['full', 'quarter', 'city', 'region', 'country', 'latitude', 'longitude'],
                'views_count', 'favorites_count',
                'average_rating', 'reviews_count',
                'owner' => ['id', 'name', 'avatar_url', 'is_agent', 'member_since'],
                'tags' => [['id', 'name', 'slug', 'type', 'icon', 'color']],
                'photos',
                'media_extra' => ['videos', 'plans', 'virtual_tour_url'],
                'documents',
                'price_history',
            ],
        ]);

        $this->assertEquals(5.0, $response->json('data.average_rating'));
        $this->assertEquals(1, $response->json('data.reviews_count'));
        // L'attente suit le schéma : `location.full` concatène la colonne telle qu'elle est
        // stockée, donc le code ISO. Que l'API serve « SN » plutôt que « Sénégal » dans une
        // chaîne destinée à l'affichage est une question de PRODUIT — le front possède le
        // texte affiché (principe non négociable n°5) — et non une question de migration :
        // on n'en profite pas pour la trancher ici.
        $this->assertSame('Almadies, Dakar, Dakar, SN', $response->json('data.location.full'));
    }

    public function test_show_hides_owner_contact_direct_fields(): void
    {
        $property = Property::factory()->published()->create();

        $response = $this->getJson("/api/public/properties/{$property->slug}");

        $response->assertOk();
        $this->assertArrayNotHasKey('email', $response->json('data.owner'));
        $this->assertArrayNotHasKey('phone', $response->json('data.owner'));
    }
}
