<?php

namespace Tests\Feature\Validation;

use App\Models\Customer;
use App\Models\Document;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Payout;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-305 — les règles de validation du domaine bien / bail / paiement, **avant** leur
 * déplacement en FormRequest.
 *
 * Même motif que {@see AdminConsoleValidationTest} : ces sites n'avaient aucun test 422 sur leur
 * URI. Ils sont joués verts sur le code d'avant le déplacement, puis rejoués après.
 */
class PropertyDomainValidationTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_property_visibility_requires_a_known_value(): void
    {
        $this->apiActingAsRole('super_admin');
        $property = Property::factory()->create();

        $this->apiPut("/api/properties/{$property->id}/visibility", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['visibility']);

        $this->apiPut("/api/properties/{$property->id}/visibility", ['visibility' => 'semi-publique'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['visibility']);
    }

    public function test_assigning_an_agent_requires_an_existing_user_id(): void
    {
        $this->apiActingAsRole('super_admin');
        $property = Property::factory()->create();

        $this->apiPut("/api/properties/{$property->id}/assigned-agent", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);

        $this->apiPut("/api/properties/{$property->id}/assigned-agent", ['user_id' => 'x'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);

        $this->apiPut("/api/properties/{$property->id}/assigned-agent", ['user_id' => 999999])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);
    }

    public function test_media_reorder_requires_an_array_of_integers(): void
    {
        $this->apiActingAsRole('super_admin');
        $property = Property::factory()->create();

        $this->apiPut("/api/properties/{$property->id}/media/reorder", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['order']);

        $this->apiPut("/api/properties/{$property->id}/media/reorder", ['order' => ['pas-un-entier']])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['order.0']);
    }

    public function test_tag_sync_requires_the_key_to_be_present_and_the_ids_to_exist(): void
    {
        $this->apiActingAsRole('super_admin');
        $property = Property::factory()->create();

        // `present` — la clé doit être là, même vide : c'est ce qui distingue « ne rien changer »
        // de « tout retirer ».
        $this->apiPost("/api/properties/{$property->id}/tags", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tag_ids']);

        $this->apiPost("/api/properties/{$property->id}/tags", ['tag_ids' => [999999]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tag_ids.0']);
    }

    public function test_inventory_room_photos_require_at_least_one_image_and_a_room_name(): void
    {
        $this->apiActingAsRole('super_admin');
        $inventory = Inventory::factory()->create();

        $this->apiPost("/api/inventories/{$inventory->id}/room-photos", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['photos', 'room_name']);

        $this->apiPost("/api/inventories/{$inventory->id}/room-photos", [
            'photos' => [],
            'room_name' => 'Salon',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['photos']);
    }

    public function test_document_share_link_bounds_its_expiry_downloads_and_password(): void
    {
        $this->apiActingAsRole('super_admin');
        $document = Document::factory()->create();

        $this->apiPost("/api/documents/{$document->id}/share", [
            'expires_at' => now()->subDay()->toIso8601String(),
            'max_downloads' => 0,
            'password' => 'ab',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['expires_at', 'max_downloads', 'password']);
    }

    public function test_lease_termination_rejects_a_non_string_reason(): void
    {
        $this->apiActingAsRole('super_admin');
        $lease = Lease::factory()->create();

        $this->apiPost("/api/leases/{$lease->id}/terminate", ['reason' => ['pas', 'une', 'chaîne']])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['reason']);
    }

    public function test_marking_a_payout_failed_requires_a_reason(): void
    {
        $this->apiActingAsRole('super_admin');
        $payout = Payout::factory()->create();

        $this->apiPost("/api/payouts/{$payout->id}/mark-failed", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['failed_reason']);

        $this->apiPost("/api/payouts/{$payout->id}/mark-failed", ['failed_reason' => ['x']])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['failed_reason']);
    }

    public function test_setting_a_primary_contact_requires_an_existing_user(): void
    {
        $this->apiActingAsRole('super_admin');
        $customer = Customer::factory()->create();

        $this->apiPost("/api/customers/{$customer->id}/primary-contact", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);

        $this->apiPost("/api/customers/{$customer->id}/primary-contact", ['user_id' => 999999])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);
    }

    public function test_favoriting_requires_an_existing_property_and_a_string_note(): void
    {
        $this->apiActingAsRole('agent');

        $this->apiPost('/api/favorites', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['property_id']);

        $this->apiPost('/api/favorites', ['property_id' => 999999])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['property_id']);

        $property = Property::factory()->create();
        $this->apiPost('/api/favorites', ['property_id' => $property->id, 'notes' => ['x']])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['notes']);
    }
}
