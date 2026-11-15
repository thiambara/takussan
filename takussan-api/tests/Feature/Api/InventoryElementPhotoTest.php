<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2646 — la photo d'un ÉLÉMENT : `POST …/room-photos` accepte `element_label` (un élément de la
 * pièce visée), gardé en propriété du média et rendu par la ressource.
 */
class InventoryElementPhotoTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: Inventory} */
    private function scaffold(): array
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $tenant = Customer::factory()->create();
        $lease = Lease::factory()->create(['property_id' => $property->id, 'landlord_id' => $owner->id, 'tenant_id' => $tenant->id]);
        $inventory = Inventory::factory()->create([
            'lease_id' => $lease->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
            'rooms' => [
                ['name' => 'Séjour', 'condition' => 'good', 'elements' => [['label' => 'Murs', 'state' => 'bon']]],
                ['name' => 'Cuisine', 'condition' => 'good', 'elements' => [['label' => 'Évier', 'state' => 'bon']]],
            ],
        ]);

        return [$owner, $inventory];
    }

    public function test_une_photo_d_element_garde_son_libelle_et_la_ressource_le_rend(): void
    {
        [$owner, $inventory] = $this->scaffold();
        Sanctum::actingAs($owner);

        $this->post("/api/inventories/{$inventory->id}/room-photos", [
            'room_name' => 'Séjour',
            'element_label' => 'Murs',
            'photos' => [UploadedFile::fake()->image('murs.jpg')],
        ], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.0.room_name', 'Séjour')
            ->assertJsonPath('data.0.element_label', 'Murs');
        $this->post("/api/inventories/{$inventory->id}/room-photos", [
            'room_name' => 'Séjour',
            'photos' => [UploadedFile::fake()->image('vue.jpg')],
        ], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.1.element_label', null);

        $this->assertSame('Murs', $inventory->refresh()->getMedia('room_photos')->first()->getCustomProperty('element_label'));

        $this->getJson("/api/inventories/{$inventory->id}")->assertOk()
            ->assertJsonPath('data.room_photos.0.room_name', 'Séjour')
            ->assertJsonPath('data.room_photos.0.photos.0.element_label', 'Murs')
            ->assertJsonPath('data.room_photos.0.photos.1.element_label', null);
    }

    public function test_un_libelle_qui_n_est_pas_un_element_de_la_piece_rend_422(): void
    {
        [$owner, $inventory] = $this->scaffold();
        Sanctum::actingAs($owner);

        foreach (['Plafond', 'Évier'] as $label) {
            $this->post("/api/inventories/{$inventory->id}/room-photos", [
                'room_name' => 'Séjour',
                'element_label' => $label,
                'photos' => [UploadedFile::fake()->image('x.jpg')],
            ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors(['element_label']);
        }

        $this->assertCount(0, $inventory->refresh()->getMedia('room_photos'));
    }
}
