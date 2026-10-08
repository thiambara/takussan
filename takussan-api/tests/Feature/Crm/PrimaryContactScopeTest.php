<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-591 AC3 — le référent d'un client est du personnel de l'agence du client, et le désigner
 * exige `crm.assign`. `exists:users,id` acceptait n'importe quel compte de la plateforme.
 */
class PrimaryContactScopeTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = $this->member('agent', $this->agency);
        $this->customer = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->agent->id,
        ]);
    }

    private function member(string $role, Agency $agency): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, $role, $agency);

        return $user;
    }

    private function designate(User $as, User $target)
    {
        return $this->actingAsApi($as)->apiPost("/api/customers/{$this->customer->id}/primary-contact", ['user_id' => $target->id]);
    }

    public function test_a_colleague_becomes_the_primary_contact(): void
    {
        $colleague = $this->member('agent', $this->agency);

        $this->designate($this->agent, $colleague)->assertOk();
        $this->assertDatabaseHas('user_customer_relationships', [
            'customer_id' => $this->customer->id,
            'user_id' => $colleague->id,
            'is_primary' => true,
        ]);
    }

    public function test_an_agent_of_another_agency_or_a_landlord_of_this_one_is_refused(): void
    {
        $this->designate($this->agent, $this->member('agent', Agency::factory()->create()))
            ->assertStatus(422)->assertJsonValidationErrors('user_id');
        $this->designate($this->agent, $this->member('owner', $this->agency))
            ->assertStatus(422)->assertJsonValidationErrors('user_id');

        $this->assertDatabaseCount('user_customer_relationships', 0);
    }

    public function test_without_crm_assign_it_is_a_403(): void
    {
        $role = AgencyRole::factory()
            ->withCapabilities([Capability::CrmViewAll])
            ->create(['agency_id' => $this->agency->id]);
        AgentProfile::query()->where('user_id', $this->agent->id)->update(['agency_role_id' => $role->id]);

        $this->designate($this->agent, $this->member('agent', $this->agency))->assertForbidden();
    }
}
