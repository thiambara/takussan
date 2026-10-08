<?php

namespace Tests\Unit\Services;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\LandlordSignatory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-596 §5 — la table de vérité de « qui signe pour le bailleur ». La même règle sert l'état des
 * lieux (§5) et le bail (§4B) : la tester ici, une fois, par cas.
 */
class LandlordSignatoryTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $landlord;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create();
        $property = Property::factory()->create(['user_id' => $this->landlord->id, 'agency_id' => $this->agency->id]);
        $this->lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $this->landlord->id,
            'tenant_id' => Customer::factory()->create()->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    public function test_the_landlord_signs_for_himself(): void
    {
        $this->assertTrue(LandlordSignatory::allows($this->landlord, $this->lease));
        $this->assertNull(LandlordSignatory::onBehalfOf($this->landlord, $this->lease));
    }

    public function test_agency_agent_with_leases_sign_signs_on_behalf_of_the_landlord(): void
    {
        $agent = $this->agencyAgent($this->agency);

        $this->assertTrue(LandlordSignatory::allows($agent, $this->lease));
        $this->assertSame($this->landlord->id, LandlordSignatory::onBehalfOf($agent, $this->lease));
    }

    public function test_agency_admin_signs_on_behalf_of_the_landlord(): void
    {
        $admin = $this->agencyAdmin($this->agency);

        $this->assertTrue(LandlordSignatory::allows($admin, $this->lease));
        $this->assertSame($this->landlord->id, LandlordSignatory::onBehalfOf($admin, $this->lease));
    }

    public function test_agency_agent_without_leases_sign_cannot(): void
    {
        $this->assertFalse(LandlordSignatory::allows($this->agentWithout($this->agency, Capability::LeasesSign), $this->lease));
    }

    public function test_agent_of_another_agency_cannot(): void
    {
        $this->assertFalse(LandlordSignatory::allows($this->agencyAgent(Agency::factory()->create()), $this->lease));
    }

    public function test_suspended_agent_cannot(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $agent->agentProfiles()->update(['status' => 'suspended']);

        $this->assertFalse(LandlordSignatory::allows($agent->refresh(), $this->lease));
    }

    public function test_other_landlord_of_the_same_agency_cannot(): void
    {
        $this->assertFalse(LandlordSignatory::allows(User::factory()->withOwnerProfile($this->agency)->create(), $this->lease));
    }

    public function test_super_admin_has_no_path_of_his_own(): void
    {
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'super_admin');

        $this->assertTrue($admin->isSuperAdmin());
        $this->assertFalse(LandlordSignatory::allows($admin, $this->lease));
    }

    public function test_property_collaborator_cannot_whatever_its_role(): void
    {
        foreach (['viewer', 'co_owner', 'manager', 'agent'] as $role) {
            $collaborator = User::factory()->create();
            $this->lease->property->collaborators()->create([
                'user_id' => $collaborator->id,
                'role' => $role,
                'accepted_at' => now(),
            ]);

            $this->assertFalse(LandlordSignatory::allows($collaborator, $this->lease), $role);
        }
    }

    public function test_blocked_landlord_loses_the_signature_in_that_agency(): void
    {
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => OwnerProfileStatus::Blocked->value]);

        $this->assertFalse(LandlordSignatory::allows($this->landlord, $this->lease));
    }

    public function test_lease_without_agency_only_the_landlord_signs(): void
    {
        $this->lease->update(['agency_id' => null]);
        $agent = $this->agencyAgent($this->agency);

        $this->assertTrue(LandlordSignatory::allows($this->landlord, $this->lease->refresh()));
        $this->assertFalse(LandlordSignatory::allows($agent, $this->lease));
    }
}
