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
 * TCK-279 AC10 — règle « last admin ».
 *
 * Le dernier administrateur d'une agence ne peut pas être réaffecté à un
 * rôle qui lui retire `team.assign_role` : plus personne ne pourrait l'en
 * sortir depuis l'API, et l'agence deviendrait ingérable sans intervention
 * en base.
 */
class LastAdminGuardTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private AgencyAdminProfile $adminProfile;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create();
        $this->adminProfile = AgencyAdminProfile::factory()->create([
            'user_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    private function toothlessAdminRole(): AgencyRole
    {
        return AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::AgencyAdmin)
            ->withCapabilities([Capability::AgencyUpdate])
            ->create(['agency_id' => $this->agency->id]);
    }

    public function test_ac10_the_last_admin_cannot_drop_assign_role(): void
    {
        $target = $this->toothlessAdminRole();
        $before = $this->adminProfile->agency_role_id;

        $this->actingAsApi($this->admin);

        $response = $this->apiPatch("/api/profiles/{$this->adminProfile->id}/agency-role", [
            'profile_type' => AgencyRoleBaseType::AgencyAdmin->value,
            'agency_role_id' => $target->id,
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('agency_role_id');
        $this->assertStringContainsString(
            'Dernier administrateur',
            $response->json('errors.agency_role_id.0'),
        );
        $this->assertSame($before, $this->adminProfile->fresh()->agency_role_id);
    }

    public function test_a_second_admin_who_keeps_the_capability_unblocks_it(): void
    {
        AgencyAdminProfile::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $this->agency->id,
        ]);

        $target = $this->toothlessAdminRole();

        $this->actingAsApi($this->admin);

        $this->apiPatch("/api/profiles/{$this->adminProfile->id}/agency-role", [
            'profile_type' => AgencyRoleBaseType::AgencyAdmin->value,
            'agency_role_id' => $target->id,
        ])->assertOk();

        $this->assertSame($target->id, $this->adminProfile->fresh()->agency_role_id);
    }

    /**
     * Le survivant doit **garder** la capacité, pas seulement exister. Un
     * second admin lui aussi privé de `team.assign_role` ne débloque rien —
     * c'est le cas qu'un simple `count() > 1` raterait.
     */
    public function test_a_second_admin_without_the_capability_does_not_unblock_it(): void
    {
        $toothless = $this->toothlessAdminRole();

        AgencyAdminProfile::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $this->agency->id,
            'agency_role_id' => $toothless->id,
        ]);

        $this->actingAsApi($this->admin);

        $this->apiPatch("/api/profiles/{$this->adminProfile->id}/agency-role", [
            'profile_type' => AgencyRoleBaseType::AgencyAdmin->value,
            'agency_role_id' => $toothless->id,
        ])->assertStatus(422)->assertJsonValidationErrors('agency_role_id');
    }

    /**
     * L'admin d'une AUTRE agence ne compte pas comme survivant : la règle se
     * juge dans la frontière d'isolation, l'agence.
     */
    public function test_an_admin_of_another_agency_does_not_count(): void
    {
        $other = Agency::factory()->create();
        AgencyAdminProfile::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $other->id,
        ]);

        $target = $this->toothlessAdminRole();

        $this->actingAsApi($this->admin);

        $this->apiPatch("/api/profiles/{$this->adminProfile->id}/agency-role", [
            'profile_type' => AgencyRoleBaseType::AgencyAdmin->value,
            'agency_role_id' => $target->id,
        ])->assertStatus(422);
    }

    /**
     * La règle ne concerne QUE les profils d'administration : un agent qu'on
     * dégrade ne rend personne prisonnier.
     */
    public function test_the_rule_does_not_apply_to_agent_profiles(): void
    {
        $agent = User::factory()->create();
        $profile = AgentProfile::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $this->agency->id,
        ]);

        $target = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->create(['agency_id' => $this->agency->id]);

        $this->actingAsApi($this->admin);

        $this->apiPatch("/api/profiles/{$profile->id}/agency-role", [
            'profile_type' => AgencyRoleBaseType::Agent->value,
            'agency_role_id' => $target->id,
        ])->assertOk();
    }
}
