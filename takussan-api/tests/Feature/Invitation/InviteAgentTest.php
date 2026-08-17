<?php

namespace Tests\Feature\Invitation;

use App\Mail\InvitationMailable;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-258 — agent invitation from the agency-side "Équipe" surface.
 *
 * Covers:
 *  - AC1: standard agency_admin invites → invitation + draft profile + mail
 *  - AC2: individual agency_admin → 403
 *  - agent without `manage_team` permission → 403
 *  - invalid role (e.g. agency_admin) → 422
 *  - 409 when an active agent already exists for that email + agency
 *  - resend / revoke proxied via the generic invitation endpoints
 *  - activity log row `agent_invited`
 */
class InviteAgentTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{Agency, User}
     */
    private function standardAgencyWithAdmin(): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $admin = $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        return [$agency, $admin];
    }

    public function test_agency_admin_can_invite_agent_in_standard_agency(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        $response = $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => 'NewAgent@example.com',
            'role' => 'agent',
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'phone' => '+221770000001',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.email', 'newagent@example.com')
            ->assertJsonPath('data.role', 'agent')
            ->assertJsonPath('data.status', InvitationStatus::Sent->value)
            ->assertJsonPath('data.agency_id', $agency->id);

        $invitation = Invitation::query()->where('email', 'newagent@example.com')->firstOrFail();
        $this->assertSame(AgentProfile::class, $invitation->invitable_type);
        $this->assertNotNull($invitation->invitable_id);

        $this->assertDatabaseHas('agent_profiles', [
            'id' => $invitation->invitable_id,
            'agency_id' => $agency->id,
            'status' => AgentProfileStatus::Draft->value,
            'user_id' => null,
        ]);

        Mail::assertSent(
            InvitationMailable::class,
            fn (InvitationMailable $m) => $m->hasTo('newagent@example.com')
        );
    }

    public function test_invite_agent_senior_and_manager_roles_are_accepted(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        foreach (['agent_senior', 'agent_manager'] as $role) {
            $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
                'email' => "{$role}@example.com",
                'role' => $role,
                'first_name' => 'X',
                'last_name' => 'Y',
            ])->assertStatus(201)->assertJsonPath('data.role', $role);
        }
    }

    public function test_invite_rejects_disallowed_roles(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => 'badrole@example.com',
            'role' => 'agency_admin',
            'first_name' => 'X',
            'last_name' => 'Y',
        ])->assertStatus(422)->assertJsonValidationErrors(['role']);
    }

    public function test_individual_agency_admin_gets_403(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => 'x@example.com',
            'role' => 'agent',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(403);
    }

    public function test_agent_without_manage_team_permission_gets_403(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agent', ['agency_id' => $agency->id]);

        $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => 'x@example.com',
            'role' => 'agent',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(403);
    }

    public function test_agent_with_manage_team_permission_can_invite(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $agent = $this->actingAsRole('agent', ['agency_id' => $agency->id]);

        // TCK-278 — la délégation passe désormais par le modèle
        // `RoleDelegation` (TCK-108) et non plus par `givePermissionTo`
        // sur spatie. Une délégation active de `agency_admin` autorise
        // les actions team.*.
        RoleDelegation::create([
            'user_id' => $agent->id,
            'delegator_id' => $agent->id,
            'agency_id' => $agency->id,
            'role' => 'agency_admin',
            'starts_at' => now(),
            'ends_at' => now()->addDay(),
            'status' => RoleDelegationStatus::Active,
            'activated_at' => now(),
            'user_native_roles_snapshot' => [],
        ]);

        $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => 'delegated@example.com',
            'role' => 'agent',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(201);
    }

    public function test_email_already_active_agent_returns_409(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        $existingUser = User::factory()->create(['email' => 'dup@example.com']);
        AgentProfile::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $existingUser->id,
            'status' => AgentProfileStatus::Active->value,
        ]);

        $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => 'dup@example.com',
            'role' => 'agent',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(409);
    }

    public function test_resend_works_via_generic_invitation_endpoint(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => 'resend@example.com',
            'role' => 'agent',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(201);

        $invitation = Invitation::query()->where('email', 'resend@example.com')->firstOrFail();
        $originalToken = $invitation->token;

        $this->postJson("/api/invitations/{$invitation->id}/resend")
            ->assertStatus(200);

        $invitation->refresh();
        $this->assertNotSame($originalToken, $invitation->token);
        Mail::assertSent(
            InvitationMailable::class,
            fn (InvitationMailable $m) => $m->hasTo('resend@example.com')
        );
    }

    public function test_revoke_works_via_generic_invitation_endpoint(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => 'revoke@example.com',
            'role' => 'agent',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(201);

        $invitation = Invitation::query()->where('email', 'revoke@example.com')->firstOrFail();

        $this->postJson("/api/invitations/{$invitation->id}/revoke")
            ->assertStatus(200);

        $this->assertSame(InvitationStatus::Revoked, $invitation->fresh()->status);
    }

    public function test_activity_log_records_agent_invited(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->standardAgencyWithAdmin();

        $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => 'log@example.com',
            'role' => 'agent_senior',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(201);

        $log = Activity::query()->where('event', 'agent_invited')->first();
        $this->assertNotNull($log);
        $this->assertSame($admin->id, $log->causer_id);
        $this->assertSame('log@example.com', data_get($log->properties, 'target_email'));
        $this->assertSame($agency->id, data_get($log->properties, 'agency_id'));
        $this->assertSame('agent_senior', data_get($log->properties, 'role'));
    }

    public function test_super_admin_bypass_works(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('super_admin');

        $this->postJson("/api/agencies/{$agency->id}/agents/invite", [
            'email' => 'sa@example.com',
            'role' => 'agent',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(201);
    }
}
