<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-076 — role-explicit signature workflow + PDF export.
 */
class InventorySignatureTest extends TestCase
{
    use RefreshDatabase;

    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';

    public function test_tenant_can_sign_as_tenant_role(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner);

        Sanctum::actingAs($tenantUser);

        $response = $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'tenant',
            'signature' => self::SIGNATURE,
        ])->assertOk();

        $response->assertJsonPath('data.tenant_signed', true);
        $response->assertJsonPath('data.owner_signed', false);
        // The raw payload must NEVER come back in the API response — only
        // the hash is exposed.
        $response->assertJsonMissingPath('data.tenant_signature_data');
        $this->assertSame(
            hash('sha256', self::SIGNATURE),
            $response->json('data.tenant_signature_hash'),
        );
    }

    public function test_property_owner_can_sign_as_landlord(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner);

        Sanctum::actingAs($owner);

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertOk()
            ->assertJsonPath('data.owner_signed', true)
            ->assertJsonPath('data.tenant_signed', false);
    }

    public function test_both_signatures_flip_status_to_signed_and_stamp_signed_at(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner);

        Sanctum::actingAs($owner);
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertOk();

        Sanctum::actingAs($tenantUser);
        $res = $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'tenant',
            'signature' => self::SIGNATURE.'tenant-variant',
        ])->assertOk();

        $res->assertJsonPath('data.status', InventoryStatus::Signed->value);
        $this->assertNotNull($res->json('data.signed_at'));
    }

    public function test_tenant_cannot_sign_as_landlord(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner);

        Sanctum::actingAs($tenantUser);

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertForbidden();
    }

    public function test_stranger_receives_403(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner);

        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'tenant',
            'signature' => self::SIGNATURE,
        ])->assertForbidden();

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertForbidden();
    }

    public function test_signing_twice_same_role_returns_409(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner);

        Sanctum::actingAs($owner);

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertOk();

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE.'v2',
        ])->assertStatus(409);
    }

    public function test_pdf_requires_fully_signed_inventory(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner);

        Sanctum::actingAs($owner);
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertOk();

        // Only the landlord has signed — PDF must be blocked (409).
        $this->getJson("/api/inventories/{$inventory->id}/pdf")
            ->assertStatus(409);
    }

    public function test_pdf_is_served_after_both_parties_sign(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner);

        Sanctum::actingAs($owner);
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            'signature' => self::SIGNATURE,
        ])->assertOk();

        Sanctum::actingAs($tenantUser);
        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'tenant',
            'signature' => self::SIGNATURE,
        ])->assertOk();

        $response = $this->get("/api/inventories/{$inventory->id}/pdf");
        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/pdf');
        $body = $response->getContent();
        $this->assertTrue(str_starts_with($body, '%PDF-'), 'Response should be a real PDF binary.');
    }

    public function test_pdf_stranger_gets_403(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = Inventory::factory()->signed()->create([
            'property_id' => $property->id,
            'lease_id' => $lease->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->get("/api/inventories/{$inventory->id}/pdf")->assertForbidden();
    }

    public function test_signed_inventory_patch_returns_409(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = Inventory::factory()->signed()->create([
            'property_id' => $property->id,
            'lease_id' => $lease->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
        ]);

        Sanctum::actingAs($owner);

        $this->patchJson("/api/inventories/{$inventory->id}", [
            'notes' => 'late-night edit',
        ])->assertStatus(409);
    }

    public function test_missing_signature_payload_returns_422(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner);

        Sanctum::actingAs($owner);

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'landlord',
            // missing signature
        ])->assertStatus(422);

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'signature' => self::SIGNATURE,
            // missing role
        ])->assertStatus(422);

        $this->postJson("/api/inventories/{$inventory->id}/sign", [
            'role' => 'bogus',
            'signature' => self::SIGNATURE,
        ])->assertStatus(422);
    }

    public function test_pdf_rejects_unsigned_inventory_with_409(): void
    {
        [$owner, $tenantUser, $tenant, $property, $lease] = $this->scaffoldLease();
        $inventory = $this->makeInventory($property, $tenant, $owner);

        Sanctum::actingAs($owner);

        $this->get("/api/inventories/{$inventory->id}/pdf")
            ->assertStatus(409);
    }

    /**
     * @return array{0: User, 1: User, 2: Customer, 3: Property, 4: Lease}
     */
    private function scaffoldLease(): array
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $tenant->id,
        ]);

        return [$owner, $tenantUser, $tenant, $property, $lease];
    }

    private function makeInventory(Property $property, Customer $tenant, User $owner): Inventory
    {
        return Inventory::factory()->pendingSignature()->create([
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
        ]);
    }
}
