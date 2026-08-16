<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-279 — AC2 à AC5 : CRUD des rôles d'agence.
 */
class AgencyRoleControllerTest extends ApiTestCase
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

    private function systemRole(AgencyRoleBaseType $type): AgencyRole
    {
        return AgencyRole::query()
            ->where('agency_id', $this->agency->id)
            ->where('base_profile_type', $type->value)
            ->firstOrFail();
    }

    public function test_ac2_index_lists_roles_with_type_system_flag_and_capabilities(): void
    {
        $this->actingAsApi($this->admin);

        $response = $this->apiGet("/api/agencies/{$this->agency->id}/roles");

        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [['id', 'name', 'base_profile_type', 'is_system', 'capabilities', 'profiles_count']],
            'meta' => ['total', 'per_page', 'current_page', 'last_page'],
        ]);
        $this->assertSame(4, $response->json('meta.total'));

        $agentRow = collect($response->json('data'))
            ->firstWhere('base_profile_type', AgencyRoleBaseType::Agent->value);
        $this->assertTrue($agentRow['is_system']);
        $this->assertContains(Capability::PropertiesPublish->value, $agentRow['capabilities']);
    }

    public function test_index_is_refused_to_a_plain_agent(): void
    {
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $this->agency->id]);

        $this->actingAsApi($agent);

        $this->apiGet("/api/agencies/{$this->agency->id}/roles")->assertForbidden();
    }

    public function test_index_does_not_leak_roles_from_another_agency(): void
    {
        $other = Agency::factory()->create();

        $this->actingAsApi($this->admin);

        $ids = collect($this->apiGet("/api/agencies/{$this->agency->id}/roles")->json('data'))
            ->pluck('id');
        $otherIds = AgencyRole::query()->where('agency_id', $other->id)->pluck('id');

        $this->assertTrue($ids->intersect($otherIds)->isEmpty());
    }

    public function test_ac3_store_creates_an_empty_custom_role(): void
    {
        $this->actingAsApi($this->admin);

        $response = $this->apiPost("/api/agencies/{$this->agency->id}/roles", [
            'name' => 'Agent senior',
            'base_profile_type' => AgencyRoleBaseType::Agent->value,
        ]);

        $response->assertCreated();
        $this->assertFalse($response->json('data.is_system'));
        $this->assertSame([], $response->json('data.capabilities'));
        $this->assertDatabaseHas('agency_roles', [
            'agency_id' => $this->agency->id,
            'name' => 'Agent senior',
            'is_system' => false,
        ]);
    }

    public function test_ac3_store_clones_capabilities_from_a_system_role(): void
    {
        $source = $this->systemRole(AgencyRoleBaseType::Agent);

        $this->actingAsApi($this->admin);

        $response = $this->apiPost("/api/agencies/{$this->agency->id}/roles", [
            'name' => 'Agent senior',
            'base_profile_type' => AgencyRoleBaseType::Agent->value,
            'clone_from' => $source->id,
        ]);

        $response->assertCreated();
        $this->assertEqualsCanonicalizing(
            $source->capabilityEnums()->map(fn (Capability $c): string => $c->value)->all(),
            $response->json('data.capabilities'),
        );
        // Le clone n'est PAS un lien : la source garde ses capacités et le
        // clone est une ligne indépendante.
        $this->assertNotSame($source->id, $response->json('data.id'));
    }

    public function test_store_refuses_a_clone_of_a_different_base_type(): void
    {
        $source = $this->systemRole(AgencyRoleBaseType::Owner);

        $this->actingAsApi($this->admin);

        $this->apiPost("/api/agencies/{$this->agency->id}/roles", [
            'name' => 'Agent senior',
            'base_profile_type' => AgencyRoleBaseType::Agent->value,
            'clone_from' => $source->id,
        ])->assertStatus(422)->assertJsonValidationErrors('clone_from');
    }

    public function test_store_refuses_a_duplicate_name_within_the_agency(): void
    {
        $this->actingAsApi($this->admin);

        $this->apiPost("/api/agencies/{$this->agency->id}/roles", [
            'name' => AgencyRoleBaseType::Agent->defaultRoleName(),
            'base_profile_type' => AgencyRoleBaseType::Agent->value,
        ])->assertStatus(422)->assertJsonValidationErrors('name');
    }

    public function test_store_refuses_a_base_profile_type_outside_the_enum(): void
    {
        $this->actingAsApi($this->admin);

        $this->apiPost("/api/agencies/{$this->agency->id}/roles", [
            'name' => 'Comptable',
            'base_profile_type' => 'accountant',
        ])->assertStatus(422)->assertJsonValidationErrors('base_profile_type');
    }

    public function test_ac4_editing_a_system_role_is_forbidden(): void
    {
        $role = $this->systemRole(AgencyRoleBaseType::Agent);

        $this->actingAsApi($this->admin);

        $this->apiPatch("/api/agencies/{$this->agency->id}/roles/{$role->id}", [
            'name' => 'Agent renommé',
        ])->assertForbidden();

        $this->assertDatabaseHas('agency_roles', [
            'id' => $role->id,
            'name' => AgencyRoleBaseType::Agent->defaultRoleName(),
        ]);
    }

    public function test_deleting_a_system_role_is_forbidden(): void
    {
        $role = $this->systemRole(AgencyRoleBaseType::Owner);

        $this->actingAsApi($this->admin);

        $this->apiDelete("/api/agencies/{$this->agency->id}/roles/{$role->id}")->assertForbidden();
        $this->assertDatabaseHas('agency_roles', ['id' => $role->id]);
    }

    public function test_a_custom_role_can_be_renamed_and_deleted(): void
    {
        $role = AgencyRole::factory()->create([
            'agency_id' => $this->agency->id,
            'base_profile_type' => AgencyRoleBaseType::Agent->value,
        ]);

        $this->actingAsApi($this->admin);

        $this->apiPatch("/api/agencies/{$this->agency->id}/roles/{$role->id}", [
            'name' => 'Agent senior',
            'description' => 'Peut publier sans validation.',
        ])->assertOk()->assertJsonPath('data.name', 'Agent senior');

        $this->apiDelete("/api/agencies/{$this->agency->id}/roles/{$role->id}")->assertOk();
        $this->assertDatabaseMissing('agency_roles', ['id' => $role->id]);
    }

    public function test_ac5_deleting_a_used_role_returns_409_with_the_profiles(): void
    {
        $role = AgencyRole::factory()->create([
            'agency_id' => $this->agency->id,
            'base_profile_type' => AgencyRoleBaseType::Agent->value,
        ]);
        $user = User::factory()->create();
        $profile = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $this->agency->id,
            'agency_role_id' => $role->id,
        ]);

        $this->actingAsApi($this->admin);

        $response = $this->apiDelete("/api/agencies/{$this->agency->id}/roles/{$role->id}");

        $response->assertStatus(409);
        $response->assertJsonStructure(['message', 'profiles' => [['id', 'type', 'user_id']]]);
        $this->assertSame($profile->id, $response->json('profiles.0.id'));
        $this->assertDatabaseHas('agency_roles', ['id' => $role->id]);
    }

    public function test_a_role_of_another_agency_is_a_404_not_a_403(): void
    {
        $other = Agency::factory()->create();
        $foreign = AgencyRole::factory()->create(['agency_id' => $other->id]);

        $this->actingAsApi($this->admin);

        $this->apiGet("/api/agencies/{$this->agency->id}/roles/{$foreign->id}")->assertNotFound();
    }

    public function test_guests_are_rejected(): void
    {
        $this->apiGet("/api/agencies/{$this->agency->id}/roles")->assertUnauthorized();
    }
}
