<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-279 AC7 — `PATCH /api/profiles/{profile}/agency-role`.
 */
class AgencyRoleAssignmentTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create();
        AgencyAdminProfile::factory()->create([
            'user_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    public function test_ac7_reassigns_a_profile_to_another_role_of_the_same_type(): void
    {
        $target = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::PropertiesPublish])
            ->create(['agency_id' => $this->agency->id]);

        $agent = User::factory()->create();
        $profile = AgentProfile::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $this->agency->id,
        ]);

        $this->actingAsApi($this->admin);

        $this->apiPatch("/api/profiles/{$profile->id}/agency-role", [
            'profile_type' => AgencyRoleBaseType::Agent->value,
            'agency_role_id' => $target->id,
        ])->assertOk()->assertJsonPath('data.agency_role_id', $target->id);

        $this->assertSame($target->id, $profile->fresh()->agency_role_id);
        // Effet immédiat sur l'autorisation.
        $this->assertTrue($agent->fresh()->canActAt(Capability::PropertiesPublish, $this->agency));
    }

    public function test_ac7_a_role_of_a_different_base_type_is_refused(): void
    {
        $ownerRole = AgencyRole::query()
            ->where('agency_id', $this->agency->id)
            ->where('base_profile_type', AgencyRoleBaseType::Owner->value)
            ->firstOrFail();

        $profile = AgentProfile::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $this->agency->id,
        ]);
        $before = $profile->agency_role_id;

        $this->actingAsApi($this->admin);

        $this->apiPatch("/api/profiles/{$profile->id}/agency-role", [
            'profile_type' => AgencyRoleBaseType::Agent->value,
            'agency_role_id' => $ownerRole->id,
        ])->assertStatus(422)->assertJsonValidationErrors('agency_role_id');

        $this->assertSame($before, $profile->fresh()->agency_role_id);
    }

    public function test_a_role_from_another_agency_is_refused(): void
    {
        $other = Agency::factory()->create();
        $foreign = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->create(['agency_id' => $other->id]);

        $profile = AgentProfile::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $this->agency->id,
        ]);

        $this->actingAsApi($this->admin);

        $this->apiPatch("/api/profiles/{$profile->id}/agency-role", [
            'profile_type' => AgencyRoleBaseType::Agent->value,
            'agency_role_id' => $foreign->id,
        ])->assertStatus(422)->assertJsonValidationErrors('agency_role_id');
    }

    public function test_a_plain_agent_cannot_reassign(): void
    {
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $this->agency->id]);

        $target = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->create(['agency_id' => $this->agency->id]);

        $victim = AgentProfile::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $this->agency->id,
        ]);

        $this->actingAsApi($agent);

        $this->apiPatch("/api/profiles/{$victim->id}/agency-role", [
            'profile_type' => AgencyRoleBaseType::Agent->value,
            'agency_role_id' => $target->id,
        ])->assertForbidden();
    }

    public function test_a_service_provider_profile_type_is_refused_by_validation(): void
    {
        $profile = AgentProfile::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $this->agency->id,
        ]);

        $this->actingAsApi($this->admin);

        // `service_provider` n'est pas assignable : ce profil n'a pas de
        // colonne `agency_role_id` (voir la migration 120200).
        $this->apiPatch("/api/profiles/{$profile->id}/agency-role", [
            'profile_type' => AgencyRoleBaseType::ServiceProvider->value,
            'agency_role_id' => 1,
        ])->assertStatus(422)->assertJsonValidationErrors('profile_type');
    }

    public function test_an_owner_profile_can_be_reassigned_too(): void
    {
        $target = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Owner)
            ->withCapabilities([Capability::PropertiesUpdateOwn, Capability::PropertiesCreate])
            ->create(['agency_id' => $this->agency->id]);

        $owner = User::factory()->create();
        $profile = OwnerProfile::factory()->create([
            'user_id' => $owner->id,
            'agency_id' => $this->agency->id,
        ]);

        $this->assertFalse($owner->canActAt(Capability::PropertiesCreate, $this->agency));

        $this->actingAsApi($this->admin);

        $this->apiPatch("/api/profiles/{$profile->id}/agency-role", [
            'profile_type' => AgencyRoleBaseType::Owner->value,
            'agency_role_id' => $target->id,
        ])->assertOk();

        $this->assertTrue($owner->fresh()->canActAt(Capability::PropertiesCreate, $this->agency));
    }
}
