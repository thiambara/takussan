<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2646 — les retenues sur caution proposées par une sortie : `retention_amount` et
 * `retention_reason` sur ses éléments, `retention_total` sur la ressource, `proposed_retention` sur la
 * restitution du bail. Une proposition, jamais un débit.
 */
class InventoryRetentionTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private User $agent;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        $agency = Agency::factory()->create();
        $owner = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id]);
        $this->lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => Customer::factory()->create()->id,
            'agency_id' => $agency->id,
            'deposit_amount' => 300000,
        ]);
        $this->agent = $this->agencyAgent($agency);
        Sanctum::actingAs($this->agent);
    }

    /** @param  array<int, array<string, mixed>>  $elements */
    private function exit(array $elements): array
    {
        return $this->postJson('/api/inventories', [
            'lease_id' => $this->lease->id,
            'type' => 'move_out',
            'general_condition' => 'fair',
            'rooms' => [['name' => 'Séjour', 'condition' => 'fair', 'elements' => $elements]],
        ])->assertCreated()->json('data');
    }

    public function test_ac7_deux_retenues_sur_une_sortie_signee_se_proposent_a_la_restitution(): void
    {
        $exit = $this->exit([
            ['label' => 'Murs', 'state' => 'endommagé', 'retention_amount' => 35000, 'retention_reason' => 'Trous à reboucher'],
            ['label' => 'Porte', 'state' => 'manquant', 'retention_amount' => 50000, 'retention_reason' => 'Porte à remplacer'],
            ['label' => 'Sol', 'state' => 'bon'],
        ]);
        $this->assertEquals(85000, $exit['retention_total']);
        $this->assertEquals(35000, $exit['rooms'][0]['elements'][0]['retention_amount']);
        $this->assertSame('Trous à reboucher', $exit['rooms'][0]['elements'][0]['retention_reason']);

        // Tant que la sortie n'est pas signée, la restitution ne propose rien.
        $this->getJson("/api/leases/{$this->lease->id}/deposit-refund")->assertOk()
            ->assertJsonPath('data.proposed_retention', null)
            ->assertJsonPath('data.proposed_retention_inventory_id', null);

        Inventory::query()->findOrFail($exit['id'])->forceFill(['status' => InventoryStatus::Signed, 'signed_at' => now()])->save();

        $state = $this->getJson("/api/leases/{$this->lease->id}/deposit-refund")->assertOk()
            ->assertJsonPath('data.proposed_retention_inventory_id', $exit['id']);
        $this->assertEquals(85000, $state->json('data.proposed_retention'));
        // Une proposition, pas un débit : rien n'est restitué ni retenu.
        $this->assertEquals(0, $state->json('data.deposit_refunded_amount'));
        $state->assertJsonPath('data.state', 'none');
        $this->assertNull($this->lease->refresh()->deposit_refunded_at);
    }

    public function test_une_sortie_contestee_ne_propose_rien(): void
    {
        $exit = $this->exit([['label' => 'Murs', 'state' => 'endommagé', 'retention_amount' => 35000]]);
        Inventory::query()->findOrFail($exit['id'])->forceFill(['status' => InventoryStatus::Disputed, 'signed_at' => now()])->save();

        $this->getJson("/api/leases/{$this->lease->id}/deposit-refund")->assertOk()->assertJsonPath('data.proposed_retention', null);
    }

    public function test_une_entree_n_a_ni_retenue_ni_total(): void
    {
        $this->postJson('/api/inventories', [
            'lease_id' => $this->lease->id,
            'type' => 'move_in',
            'general_condition' => 'good',
            'rooms' => [['name' => 'Séjour', 'condition' => 'good', 'elements' => [['label' => 'Murs', 'state' => 'bon', 'retention_amount' => 1000]]]],
        ])->assertStatus(422)->assertJsonValidationErrors(['rooms.0.elements.0.retention_amount']);

        $entry = $this->postJson('/api/inventories', [
            'lease_id' => $this->lease->id,
            'type' => 'move_in',
            'general_condition' => 'good',
            'rooms' => [['name' => 'Séjour', 'condition' => 'good', 'elements' => [['label' => 'Murs', 'state' => 'bon']]]],
        ])->assertCreated()->assertJsonPath('data.retention_total', null)->json('data');

        $this->patchJson("/api/inventories/{$entry['id']}", [
            'rooms' => [['name' => 'Séjour', 'condition' => 'good', 'elements' => [['label' => 'Murs', 'state' => 'bon', 'retention_reason' => 'x']]]],
        ])->assertStatus(422)->assertJsonValidationErrors(['rooms.0.elements.0.retention_reason']);
    }

    public function test_une_retenue_est_un_montant_positif_ou_nul(): void
    {
        $this->postJson('/api/inventories', [
            'lease_id' => $this->lease->id,
            'type' => 'move_out',
            'general_condition' => 'fair',
            'rooms' => [['name' => 'Séjour', 'condition' => 'fair', 'elements' => [
                ['label' => 'Murs', 'state' => 'usé', 'retention_amount' => -1],
                ['label' => 'Sol', 'state' => 'usé', 'retention_amount' => 'beaucoup'],
            ]]],
        ])->assertStatus(422)->assertJsonValidationErrors(['rooms.0.elements.0.retention_amount', 'rooms.0.elements.1.retention_amount']);

        $exit = $this->exit([['label' => 'Murs', 'state' => 'usé', 'retention_amount' => 0]]);
        $this->assertEquals(0, $exit['retention_total']);

        // Sur une sortie en brouillon, un `PATCH` remplace les retenues.
        $patched = $this->patchJson("/api/inventories/{$exit['id']}", [
            'rooms' => [['name' => 'Séjour', 'condition' => 'fair', 'elements' => [['label' => 'Murs', 'state' => 'endommagé', 'retention_amount' => 12500.5]]]],
        ])->assertOk()->json('data');
        $this->assertEquals(12500.5, $patched['retention_total']);
    }
}
