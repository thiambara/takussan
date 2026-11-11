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
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2646 (ADR-0098 §7, amendement de §1.9) — seules les deux parties contestent un état des lieux :
 * le locataire et le bailleur du bail. Le personnel, et celui qui l'a conduit, reçoivent 403 —
 * le super-admin aussi : il n'est pas une partie.
 */
class InventoryDisputeAuthorizationTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $owner;

    private User $tenantUser;

    private Property $property;

    private Lease $lease;

    private User $conductor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->owner = User::factory()->withOwnerProfile($this->agency)->create();
        $this->property = Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $this->agency->id]);
        $this->tenantUser = User::factory()->create();
        $this->lease = Lease::factory()->create([
            'property_id' => $this->property->id,
            'landlord_id' => $this->owner->id,
            'tenant_id' => Customer::factory()->create(['user_id' => $this->tenantUser->id])->id,
            'agency_id' => $this->agency->id,
        ]);
        $this->conductor = $this->agencyAgent($this->agency);
    }

    private function inventory(): Inventory
    {
        return Inventory::factory()->pendingSignature()->create([
            'lease_id' => $this->lease->id,
            'property_id' => $this->property->id,
            'tenant_id' => $this->lease->tenant_id,
            'conducted_by' => $this->conductor->id,
        ]);
    }

    private function dispute(Inventory $inventory): TestResponse
    {
        return $this->postJson("/api/inventories/{$inventory->id}/dispute", ['reason' => 'Le sol était déjà rayé.']);
    }

    public function test_ac8_l_admin_de_l_agence_le_conducteur_et_le_super_admin_recoivent_403(): void
    {
        $inventory = $this->inventory();

        foreach ([$this->agencyAdmin($this->agency), $this->conductor, $this->agencyAgent($this->agency)] as $staff) {
            Sanctum::actingAs($staff);
            $this->dispute($inventory)->assertForbidden();
        }

        $this->actingAsRole('super_admin');
        $this->dispute($inventory)->assertForbidden();

        $this->assertSame(InventoryStatus::PendingSignature, $inventory->refresh()->status);
    }

    public function test_ac8_le_locataire_conteste(): void
    {
        $inventory = $this->inventory();

        Sanctum::actingAs($this->tenantUser);
        $this->dispute($inventory)->assertOk()->assertJsonPath('data.status', InventoryStatus::Disputed->value);
    }

    public function test_ac8_le_bailleur_conteste(): void
    {
        $inventory = $this->inventory();

        Sanctum::actingAs($this->owner);
        $this->dispute($inventory)->assertOk()->assertJsonPath('data.status', InventoryStatus::Disputed->value);
    }

    /** Un bailleur qui a conduit l'état des lieux lui-même reste partie : il le conteste. */
    public function test_le_bailleur_qui_l_a_conduit_reste_partie(): void
    {
        $inventory = $this->inventory();
        $inventory->forceFill(['conducted_by' => $this->owner->id])->save();

        Sanctum::actingAs($this->owner);
        $this->dispute($inventory)->assertOk();
    }

    /** Un collaborateur du bien, ou un autre bailleur de l'agence, n'est pas partie. */
    public function test_un_collaborateur_ou_un_autre_bailleur_recoit_403(): void
    {
        $inventory = $this->inventory();
        $collaborator = User::factory()->create();
        $this->property->collaborators()->create(['user_id' => $collaborator->id, 'role' => 'co_owner', 'accepted_at' => now()]);

        foreach ([$collaborator, User::factory()->withOwnerProfile($this->agency)->create()] as $user) {
            Sanctum::actingAs($user);
            $this->dispute($inventory)->assertForbidden();
        }
    }

    /** L'autorisation précède la validation : un tiers sans motif reçoit 403, une partie sans motif 422. */
    public function test_l_autorisation_precede_la_validation(): void
    {
        $inventory = $this->inventory();

        Sanctum::actingAs($this->conductor);
        $this->postJson("/api/inventories/{$inventory->id}/dispute", [])->assertForbidden();

        Sanctum::actingAs($this->tenantUser);
        $this->postJson("/api/inventories/{$inventory->id}/dispute", [])->assertStatus(422);
    }
}
