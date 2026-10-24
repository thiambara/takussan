<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-1498 (P116.01) — changer le rôle système d'un membre (`PUT /api/users/{u}/role`,
 * `PUT /api/agencies/{a}/members/{u}/role`) se juge par `team.assign_role`, dans
 * `AgencyPolicy::changeMemberRole`, comme affecter un rôle personnalisé (`AgencyRolePolicy::assign`).
 *
 * Avant : les deux FormRequest reprenaient « être admin de l'agence active » ; un admin dont le rôle
 * retire `team.assign_role` promouvait un agent admin d'agence, un agent qui la porte recevait 403.
 */
class MemberRoleChangeCapabilityTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $landlord;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->agent = $this->agencyAgent($this->agency);
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create();
    }

    private function changeByUserRoute(User $actor): TestResponse
    {
        return $this->actingAsApi($actor)->putJson("/api/users/{$this->agent->id}/role", ['role' => 'agency_admin']);
    }

    private function changeByMemberRoute(User $actor): TestResponse
    {
        return $this->actingAsApi($actor)
            ->putJson("/api/agencies/{$this->agency->id}/members/{$this->landlord->id}/role", ['role' => 'agent']);
    }

    public function test_un_admin_sans_team_assign_role_est_refuse_sur_les_deux_routes(): void
    {
        $admin = $this->adminWithout($this->agency, Capability::TeamAssignRole);

        $this->changeByUserRoute($admin)->assertForbidden();
        $this->changeByMemberRoute($admin)->assertForbidden();

        $this->assertFalse($this->agent->fresh()->isAgencyAdminAt((int) $this->agency->id));
        $this->assertFalse($this->landlord->fresh()->isAgentAt((int) $this->agency->id));
    }

    public function test_un_agent_qui_porte_team_assign_role_change_le_role(): void
    {
        $actor = $this->agentWith($this->agency, Capability::TeamAssignRole);

        $this->changeByUserRoute($actor)->assertOk();
        $this->changeByMemberRoute($actor)->assertOk();

        $this->assertTrue($this->agent->fresh()->isAgencyAdminAt((int) $this->agency->id));
        $this->assertTrue($this->landlord->fresh()->isAgentAt((int) $this->agency->id));
    }

    public function test_un_agent_sans_la_capacite_est_refuse(): void
    {
        $actor = $this->agencyAgent($this->agency);

        $this->changeByUserRoute($actor)->assertForbidden();
        $this->changeByMemberRoute($actor)->assertForbidden();
    }

    public function test_l_admin_du_role_systeme_garde_le_geste(): void
    {
        $this->changeByUserRoute($this->agencyAdmin($this->agency))->assertOk();
        $this->changeByMemberRoute($this->agencyAdmin($this->agency))->assertOk();
    }

    public function test_l_admin_principal_garde_le_geste_meme_sans_la_capacite(): void
    {
        $principal = $this->adminWithout($this->agency, Capability::TeamAssignRole);
        $this->agency->update(['primary_admin_id' => $principal->id]);

        $this->changeByMemberRoute($principal)->assertOk();
    }

    /**
     * TCK-2205 (P227.03) — rattacher un compte comme `agency_admin` (`POST /api/agencies/{a}/members`)
     * confère le rôle que le changement de rôle juge par `team.assign_role` : même règle.
     */
    private function attachAsAdmin(User $actor, User $target, string $role = 'agency_admin'): TestResponse
    {
        return $this->actingAsApi($actor)
            ->postJson("/api/agencies/{$this->agency->id}/members", ['user_id' => $target->id, 'role' => $role]);
    }

    public function test_un_admin_sans_team_assign_role_ne_rattache_pas_un_compte_comme_admin(): void
    {
        $admin = $this->adminWithout($this->agency, Capability::TeamAssignRole);
        $target = User::factory()->create();

        $this->attachAsAdmin($admin, $target)->assertForbidden();

        $this->assertFalse($target->fresh()->isAgencyAdminAt((int) $this->agency->id));
        $this->assertFalse($target->fresh()->isAgentAt((int) $this->agency->id));

        // Le rattachement comme agent ne confère aucun rôle d'administration : il reste ouvert.
        $this->attachAsAdmin($admin, $target, 'agent')->assertOk();
        $this->assertTrue($target->fresh()->isAgentAt((int) $this->agency->id));
        $this->assertFalse($target->fresh()->isAgencyAdminAt((int) $this->agency->id));
    }

    public function test_l_admin_du_role_systeme_rattache_un_compte_comme_admin(): void
    {
        $target = User::factory()->create();

        $this->attachAsAdmin($this->agencyAdmin($this->agency), $target)->assertOk();

        $this->assertTrue($target->fresh()->isAgencyAdminAt((int) $this->agency->id));
    }

    public function test_l_admin_principal_rattache_un_compte_comme_admin_meme_sans_la_capacite(): void
    {
        $principal = $this->adminWithout($this->agency, Capability::TeamAssignRole);
        $this->agency->update(['primary_admin_id' => $principal->id]);
        $target = User::factory()->create();

        $this->attachAsAdmin($principal, $target)->assertOk();

        $this->assertTrue($target->fresh()->isAgencyAdminAt((int) $this->agency->id));
    }

    public function test_le_personnel_d_une_autre_agence_est_refuse(): void
    {
        $this->changeByMemberRoute($this->agencyAdmin(Agency::factory()->create()))->assertForbidden();
    }
}
