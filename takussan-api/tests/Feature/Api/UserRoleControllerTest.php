<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * Tests for the dedicated PUT /api/users/{user}/role endpoint (TCK-014).
 *
 * Separate from UserAdminController — this endpoint is the single source of
 * truth for replacing a user's role (swap profile, not additive).
 */
class UserRoleControllerTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_set_user_role(): void
    {
        $this->apiActingAsRole('super_admin');

        $target = User::factory()->create([
            'agency_id' => Agency::factory()->create()->id,
        ]);

        $response = $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertOk();

        $this->assertSame('agent', $response->json('data.role'));
        $this->assertContains('agent', $response->json('data.roles'));
    }

    public function test_agency_admin_can_set_role_for_user_in_own_agency(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertOk();

        $this->assertTrue($target->fresh()->isAgentAt($agency->id));
        $this->assertNotNull($admin);
    }

    public function test_agency_admin_cannot_set_role_for_user_in_another_agency(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agencyA]);
        $target = User::factory()->create(['agency_id' => $agencyB->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertForbidden();
    }

    public function test_agent_cannot_assign_roles(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'customer'])
            ->assertForbidden();
    }

    public function test_customer_cannot_assign_roles(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('customer', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertForbidden();
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $target = User::factory()->create();

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertUnauthorized();
    }

    public function test_agency_admin_cannot_grant_super_admin(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        // TCK-600 (ADR-0047 §4) — `super_admin` n'est plus un rôle de cette route, pour personne.
        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'super_admin'])
            ->assertStatus(422);
        $this->assertFalse($target->fresh()->isSuperAdmin());
    }

    /** TCK-600 (ADR-0047 §4) — la cooptation est le seul chemin d'octroi (`SuperAdminGrantOnlyByCooptationTest`). */
    public function test_super_admin_cannot_grant_super_admin_through_this_route(): void
    {
        $this->apiActingAsRole('super_admin');
        $target = User::factory()->create();

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'super_admin'])
            ->assertStatus(422);

        $this->assertFalse($target->fresh()->isSuperAdmin());
    }

    public function test_replacing_role_removes_previous_roles(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        // First assign: agent
        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertOk();

        // Replace with: owner
        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'owner'])
            ->assertOk();

        $fresh = $target->fresh();
        $this->assertTrue($fresh->isOwnerAt($agency->id));
        $this->assertFalse($fresh->isAgentAt($agency->id));
        $this->assertNotNull($admin);
    }

    public function test_invalid_role_returns_validation_error(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $target = User::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'hacker'])
            ->assertStatus(422);
    }

    public function test_agency_admin_cannot_change_role_of_user_without_agency(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        // Target has no agency binding (e.g. public customer, orphan user).
        $target = User::factory()->create(['agency_id' => null]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertForbidden();
    }

    public function test_super_admin_assigns_agency_scoped_role_under_target_agency(): void
    {
        // TCK-278 — PR #104 regression rewritten : le rôle agent est
        // matérialisé par un AgentProfile attaché à l'agence du *target*,
        // peu importe que l'acteur soit super_admin (sans active profile).
        $this->apiActingAsRole('super_admin');

        $targetAgency = Agency::factory()->create();
        $target = User::factory()->create(['agency_id' => $targetAgency->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertOk();

        $this->assertTrue(
            $target->fresh()->isAgentAt($targetAgency->id),
            'Agent profile must be materialized on the target agency.',
        );
    }

    public function test_super_admin_cannot_assign_agency_role_to_user_without_resolvable_agency(): void
    {
        // Multi-profile target without active context — `agency_id` accessor
        // returns null. Refusing to bind an agency-scoped role to team_id=null
        // is the correct behavior; previously it silently promoted the role.
        $this->apiActingAsRole('super_admin');

        $target = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        AgentProfile::factory()->create(['user_id' => $target->id, 'agency_id' => $a->id]);
        AgentProfile::factory()->create(['user_id' => $target->id, 'agency_id' => $b->id]);

        $this->apiPut("/api/users/{$target->id}/role", ['role' => 'agent'])
            ->assertStatus(422);
    }

    /*
     * TCK-664 (P03.01) — les gardes d'AgencyMemberRemovalService et de TeamMemberSuspensionService
     * s'appliquent au changement de rôle : l'admin principal, le dernier admin, soi-même et un
     * membre non actif sont refusés, et rien n'est écrit.
     */

    public function test_actor_cannot_change_own_role(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        AgencyAdminProfile::factory()->create(['agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$admin->id}/role", ['role' => 'agent'])
            ->assertStatus(422)->assertJsonPath('code', 'user.role_change_self');

        $this->assertTrue($admin->fresh()->isAgencyAdminAt($agency->id));
        $this->assertFalse($admin->fresh()->isAgentAt($agency->id));
    }

    public function test_primary_admin_cannot_be_demoted(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $primary = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $primary->id, 'agency_id' => $agency->id]);
        $agency->update(['primary_admin_id' => $primary->id]);

        $this->apiPut("/api/users/{$primary->id}/role", ['role' => 'agent'])
            ->assertStatus(422)->assertJsonPath('code', 'user.role_primary_admin');

        $this->assertTrue($primary->fresh()->isAgencyAdminAt($agency->id));
    }

    public function test_last_admin_cannot_be_demoted(): void
    {
        $this->apiActingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $soleAdmin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $soleAdmin->id, 'agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$soleAdmin->id}/role", ['role' => 'owner'])
            ->assertStatus(422)->assertJsonPath('code', 'user.role_last_admin');

        $this->assertTrue($soleAdmin->fresh()->isAgencyAdminAt($agency->id));
        $this->assertFalse($soleAdmin->fresh()->isOwnerAt($agency->id));
    }

    public function test_non_active_member_cannot_change_role(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $suspended = User::factory()->create();
        AgentProfile::factory()->suspended()->create(['user_id' => $suspended->id, 'agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$suspended->id}/role", ['role' => 'agency_admin'])
            ->assertStatus(422)->assertJsonPath('code', 'user.role_member_not_active');

        $this->assertFalse($suspended->fresh()->isAgencyAdminAt($agency->id));
        $this->assertSame(
            AgentProfileStatus::Suspended,
            AgentProfile::query()->where('user_id', $suspended->id)->where('agency_id', $agency->id)->sole()->status,
        );
    }

    /** Versant autorisé : un co-admin qui n'est ni principal, ni le dernier, ni soi se rétrograde. */
    public function test_co_admin_can_be_demoted_when_another_admin_remains(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);
        $coAdmin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $coAdmin->id, 'agency_id' => $agency->id]);

        $this->apiPut("/api/users/{$coAdmin->id}/role", ['role' => 'agent'])->assertOk();

        $this->assertTrue($coAdmin->fresh()->isAgentAt($agency->id));
        $this->assertFalse($coAdmin->fresh()->isAgencyAdminAt($agency->id));
    }
}
