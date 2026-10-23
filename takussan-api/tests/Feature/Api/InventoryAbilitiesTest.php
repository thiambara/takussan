<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1869 (P189.02) — la fiche d'un état des lieux sert `abilities.update`, le verdict de
 * `InventoryPolicy::update` qui garde « Soumettre » et le dépôt de photos : l'écran les jugeait sur
 * le seul statut `draft`, et les montrait au locataire et au bailleur suspendu, refusés en 403.
 */
class InventoryAbilitiesTest extends TestCase
{
    use RefreshDatabase;

    public function test_abilities_update_suit_la_policy_pour_le_lecteur(): void
    {
        $agency = Agency::factory()->create();
        $owner = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id]);
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->id,
        ]);
        $inventory = Inventory::factory()->create([
            'lease_id' => $lease->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
            'status' => 'draft',
        ]);

        Sanctum::actingAs($owner);
        $this->getJson("/api/inventories/{$inventory->id}")->assertOk()
            ->assertJsonPath('data.abilities', ['update' => true]);

        Sanctum::actingAs($tenantUser);
        $this->getJson("/api/inventories/{$inventory->id}")->assertOk()
            ->assertJsonPath('data.abilities', ['update' => false]);
        $this->postJson("/api/inventories/{$inventory->id}/submit")->assertForbidden();

        OwnerProfile::query()->where('user_id', $owner->id)->where('agency_id', $agency->id)
            ->update(['status' => OwnerProfileStatus::Blocked->value]);

        Sanctum::actingAs($owner);
        $this->getJson("/api/inventories/{$inventory->id}")->assertOk()
            ->assertJsonPath('data.abilities', ['update' => false]);
        $this->postJson("/api/inventories/{$inventory->id}/submit")->assertForbidden();
    }
}
