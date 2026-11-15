<?php

namespace Tests\Feature\Api;

use App\Domain\Inventory\InventoryTemplates;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\PropertyType;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2646 (décision famille 4 n° 7a) — `GET /api/inventory-templates` : le modèle Takussan d'un bien
 * (ou d'un type de bien). Il propose, il n'impose rien — et chaque modèle se poste tel quel dans les
 * bornes de l'état des lieux.
 */
class InventoryTemplateTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->agent = $this->agencyAgent($this->agency);
    }

    private function property(PropertyType $type, ?int $bedrooms): Property
    {
        return Property::factory()->create(['agency_id' => $this->agency->id, 'type' => $type, 'bedrooms' => $bedrooms]);
    }

    public function test_ac5_un_f3_propose_sejour_deux_chambres_cuisine_salle_d_eau_et_wc_avec_leurs_elements(): void
    {
        $f3 = $this->property(PropertyType::Apartment, 2);

        Sanctum::actingAs($this->agent);
        $response = $this->getJson("/api/inventory-templates?property_id={$f3->id}", ['Accept-Language' => 'fr'])
            ->assertOk()
            ->assertJsonPath('data.key', InventoryTemplates::F3)
            ->assertJsonPath('data.property_type', 'apartment');

        $rooms = collect($response->json('data.rooms'));
        foreach (['Séjour', 'Chambre 1', 'Chambre 2', 'Cuisine', "Salle d'eau", 'WC'] as $name) {
            $room = $rooms->firstWhere('name', $name);
            $this->assertNotNull($room, "{$name} absente du modèle F3");
            $this->assertNotEmpty($room['elements'], "{$name} sans éléments");
            $this->assertNotEmpty($room['elements'][0]['label']);
            $this->assertNotEmpty($room['elements'][0]['key']);
        }
        $this->assertContains('Murs', array_column($rooms->firstWhere('name', 'Séjour')['elements'], 'label'));
        $this->assertContains('Plaques de cuisson', array_column($rooms->firstWhere('name', 'Cuisine')['elements'], 'label'));
    }

    public function test_le_nom_suit_la_langue_de_la_requete(): void
    {
        $f3 = $this->property(PropertyType::Apartment, 2);

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/inventory-templates?property_id={$f3->id}", ['Accept-Language' => 'en'])
            ->assertOk()->assertJsonPath('data.rooms.0.name', 'Living room')->assertJsonPath('data.rooms.0.key', 'living_room');
    }

    /** @return array<string, array{PropertyType, int|null, string}> */
    public static function typesDeBiens(): array
    {
        return [
            'studio' => [PropertyType::Studio, null, InventoryTemplates::STUDIO],
            'chambre' => [PropertyType::Room, null, InventoryTemplates::STUDIO],
            'appartement sans chambre' => [PropertyType::Apartment, 0, InventoryTemplates::STUDIO],
            'F2' => [PropertyType::Apartment, 1, InventoryTemplates::F2],
            'maison F3' => [PropertyType::House, 2, InventoryTemplates::F3],
            'F5' => [PropertyType::Apartment, 4, InventoryTemplates::F4_PLUS],
            'appartement de taille inconnue' => [PropertyType::Apartment, null, InventoryTemplates::GENERIC],
            'villa' => [PropertyType::Villa, 5, InventoryTemplates::VILLA],
            'local commercial' => [PropertyType::Shop, null, InventoryTemplates::SHOP],
            'bureau' => [PropertyType::Office, null, InventoryTemplates::OFFICE],
            'entrepôt (sans modèle)' => [PropertyType::Warehouse, null, InventoryTemplates::GENERIC],
        ];
    }

    #[DataProvider('typesDeBiens')]
    public function test_chaque_type_de_bien_recoit_son_modele(PropertyType $type, ?int $bedrooms, string $expected): void
    {
        $property = $this->property($type, $bedrooms);

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/inventory-templates?property_id={$property->id}")->assertOk()->assertJsonPath('data.key', $expected);
    }

    public function test_par_type_de_bien_et_nombre_de_chambres(): void
    {
        Sanctum::actingAs($this->agent);
        $rooms = $this->getJson('/api/inventory-templates?property_type=villa&bedrooms=5', ['Accept-Language' => 'fr'])
            ->assertOk()->assertJsonPath('data.key', InventoryTemplates::VILLA)->json('data.rooms');

        $this->assertSame(['Chambre 1', 'Chambre 2', 'Chambre 3', 'Chambre 4', 'Chambre 5'],
            array_values(array_filter(array_column($rooms, 'name'), fn (string $n) => str_starts_with($n, 'Chambre'))));
    }

    /** Le modèle propose, il n'impose rien — mais chacun, au plus grand, tient dans les bornes et se poste tel quel. */
    public function test_chaque_modele_au_plus_grand_se_poste_tel_quel(): void
    {
        $owner = User::factory()->withOwnerProfile($this->agency)->create();
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $this->agency->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => Customer::factory()->create()->id,
            'agency_id' => $this->agency->id,
        ]);

        Sanctum::actingAs($this->agent);
        foreach (InventoryTemplates::KEYS as $key) {
            $rooms = array_map(fn (array $room): array => [
                'name' => $room['name'],
                'condition' => 'good',
                'elements' => array_map(fn (array $e): array => ['label' => $e['label'], 'state' => 'bon'], $room['elements']),
            ], InventoryTemplates::rooms($key, 50));

            $this->postJson('/api/inventories', [
                'lease_id' => $lease->id,
                'type' => 'move_in',
                'general_condition' => 'good',
                'rooms' => $rooms,
            ])->assertCreated();
        }
    }

    public function test_un_bien_que_l_appelant_ne_lit_pas_ou_absent_recoit_403(): void
    {
        $other = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/inventory-templates?property_id={$other->id}")->assertForbidden();
        $this->getJson('/api/inventory-templates?property_id=999999999')->assertForbidden();
    }

    /** Une liste à la place d'une valeur, ou ni bien ni type, ou les deux : 422. */
    public function test_les_parametres_mal_formes_rendent_422(): void
    {
        $f3 = $this->property(PropertyType::Apartment, 2);

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/inventory-templates?property_id[]={$f3->id}")->assertStatus(422)->assertJsonValidationErrors(['property_id']);
        $this->getJson('/api/inventory-templates?property_type[]=villa')->assertStatus(422)->assertJsonValidationErrors(['property_type']);
        $this->getJson('/api/inventory-templates')->assertStatus(422);
        $this->getJson('/api/inventory-templates?property_type=castle')->assertStatus(422)->assertJsonValidationErrors(['property_type']);
        $this->getJson("/api/inventory-templates?property_id={$f3->id}&property_type=villa")->assertStatus(422);
        $this->getJson('/api/inventory-templates?property_type=villa&bedrooms[]=2')->assertStatus(422)->assertJsonValidationErrors(['bedrooms']);
    }

    public function test_les_noms_existent_dans_les_trois_langues(): void
    {
        foreach (['fr', 'en', 'wo'] as $locale) {
            foreach (InventoryTemplates::roomKinds() as $kind) {
                $this->assertNotSame("inventory_templates.rooms.{$kind}", __("inventory_templates.rooms.{$kind}", [], $locale), "{$locale} : pièce {$kind}");
            }
            foreach (InventoryTemplates::elementKeys() as $element) {
                $this->assertNotSame("inventory_templates.elements.{$element}", __("inventory_templates.elements.{$element}", [], $locale), "{$locale} : élément {$element}");
            }
        }
    }
}
