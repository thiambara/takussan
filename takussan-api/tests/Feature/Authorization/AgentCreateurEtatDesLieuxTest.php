<?php

namespace Tests\Feature\Authorization;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Membership\TeamMemberSuspensionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-1928 (P190.01, décision du porteur) — `InventoryPolicy` acceptait le propriétaire du bien par
 * `properties.user_id` seul, que l'agent qui a saisi le bien porte aussi : suspendu ou retiré, il
 * lisait, modifiait et listait l'état des lieux. Lecture par `BailleurDuBien::est`, écriture par
 * `bailleurEcrit`, même borne pour la liste.
 */
class AgentCreateurEtatDesLieuxTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildStakeholders();
        $this->admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
    }

    /** Un état des lieux conduit par un tiers, sur le bien dont `user_id` désigne `$auteur`. */
    private function etatDesLieuxDuBienDe(User $auteur): Inventory
    {
        $this->property->forceFill(['user_id' => $auteur->id])->save();
        $tenant = Customer::factory()->create(['user_id' => $this->client->id]);
        $lease = Lease::factory()->create([
            'property_id' => $this->property->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $auteur->id,
            'tenant_id' => $tenant->id,
            'status' => LeaseStatus::Active,
        ]);

        return Inventory::factory()->create([
            'lease_id' => $lease->id,
            'property_id' => $this->property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => User::factory()->create()->id,
        ]);
    }

    /** @return list<int> */
    private function listeDe(User $user): array
    {
        Sanctum::actingAs($user);

        return collect($this->getJson('/api/inventories')->assertOk()->json('data'))->pluck('id')->all();
    }

    private function assertPlusRien(User $agent, Inventory $inventory): void
    {
        $agent = $agent->fresh();
        Sanctum::actingAs($agent);
        $this->getJson("/api/inventories/{$inventory->id}")->assertForbidden();
        $this->patchJson("/api/inventories/{$inventory->id}", ['general_condition' => 'fair'])->assertForbidden();
        $this->assertNotContains($inventory->id, $this->listeDe($agent));
        $this->assertSame('good', $inventory->fresh()->general_condition->value);
    }

    public function test_l_agent_createur_suspendu_ne_lit_ni_ne_modifie_ni_ne_liste(): void
    {
        $inventory = $this->etatDesLieuxDuBienDe($this->agent);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertPlusRien($this->agent, $inventory);
    }

    public function test_l_agent_createur_retire_ne_lit_ni_ne_modifie_ni_ne_liste(): void
    {
        $inventory = $this->etatDesLieuxDuBienDe($this->agent);
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        $this->assertPlusRien($this->agent, $inventory);
    }

    /** Témoin : le bailleur du bien, bloqué, garde la lecture et la liste, plus l'écriture. */
    public function test_le_bailleur_bloque_lit_et_liste_sans_modifier(): void
    {
        $inventory = $this->etatDesLieuxDuBienDe($this->landlord);
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => 'blocked']);

        Sanctum::actingAs($this->landlord);
        $this->getJson("/api/inventories/{$inventory->id}")->assertOk();
        $this->patchJson("/api/inventories/{$inventory->id}", ['general_condition' => 'fair'])->assertForbidden();
        $this->assertContains($inventory->id, $this->listeDe($this->landlord));
    }

    /** Témoin : le bailleur actif lit, modifie et liste. */
    public function test_le_bailleur_actif_garde_tout(): void
    {
        $inventory = $this->etatDesLieuxDuBienDe($this->landlord);

        Sanctum::actingAs($this->landlord);
        $this->getJson("/api/inventories/{$inventory->id}")->assertOk();
        $this->patchJson("/api/inventories/{$inventory->id}", ['general_condition' => 'fair'])->assertOk();
        $this->assertContains($inventory->id, $this->listeDe($this->landlord));
    }
}
