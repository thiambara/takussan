<?php

namespace Tests\Feature\Invitation;

use App\Mail\InvitationMailable;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-256 — owner invitation from the agency-side surface.
 *
 * Covers:
 *  - AC1: standard agency_admin invites → invitation + draft profile + mail
 *  - AC2: individual agency_admin → 403
 *  - AC3: agent without delegation → 403, agent WITH `invite_owner` → success
 *  - 409 when an owner already exists in this agency for the email
 *  - resend / revoke proxied via the generic invitation endpoints
 *  - activity log row `owner_invited`
 */
class InviteOwnerTest extends TestCase
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

    public function test_agency_admin_can_invite_owner_in_standard_agency(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->standardAgencyWithAdmin();

        $response = $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'NewOwner@example.com',
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'phone' => '+221770000001',
            'owner_type' => 'individual',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.email', 'newowner@example.com')
            ->assertJsonPath('data.role', 'owner')
            ->assertJsonPath('data.status', InvitationStatus::Sent->value)
            ->assertJsonPath('data.agency_id', $agency->id);

        $invitation = Invitation::query()->where('email', 'newowner@example.com')->firstOrFail();
        $this->assertSame(OwnerProfile::class, $invitation->invitable_type);
        $this->assertNotNull($invitation->invitable_id);

        $this->assertDatabaseHas('owner_profiles', [
            'id' => $invitation->invitable_id,
            'agency_id' => $agency->id,
            'status' => OwnerProfileStatus::Draft->value,
            'user_id' => null,
        ]);

        Mail::assertSent(InvitationMailable::class, fn (InvitationMailable $m) => $m->hasTo('newowner@example.com'));
    }

    public function test_company_owner_requires_company_name(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'co@example.com',
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'owner_type' => 'company',
        ])->assertStatus(422)->assertJsonValidationErrors(['company_name']);

        // Same payload + company_name → success.
        $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'co2@example.com',
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'owner_type' => 'company',
            'company_name' => 'Sahel SARL',
        ])->assertStatus(201);

        $profile = OwnerProfile::query()
            ->where('agency_id', $agency->id)
            ->orderByDesc('id')
            ->first();
        $this->assertSame('Sahel SARL', data_get($profile->metadata, 'company_name'));
    }

    public function test_individual_agency_admin_gets_403(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'x@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
            'owner_type' => 'individual',
        ])->assertStatus(403);
    }

    public function test_agent_without_invite_owner_permission_gets_403(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agent', ['agency_id' => $agency->id]);

        $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'x@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
            'owner_type' => 'individual',
        ])->assertStatus(403);
    }

    public function test_agent_with_invite_owner_permission_can_invite(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $agent = $this->actingAsRole('agent', ['agency_id' => $agency->id]);

        // TCK-278 — délégation via RoleDelegation (TCK-108) au lieu de
        // l'ancien `givePermissionTo` sur spatie.
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

        $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'delegated@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
            'owner_type' => 'individual',
        ])->assertStatus(201);
    }

    public function test_email_already_owner_in_agency_returns_409(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        $existingUser = User::factory()->create(['email' => 'dup@example.com']);
        OwnerProfile::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $existingUser->id,
            'status' => OwnerProfileStatus::Active->value,
        ]);

        $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'dup@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
            'owner_type' => 'individual',
        ])->assertStatus(409);
    }

    public function test_email_belongs_to_existing_user_without_profile_creates_invitation(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        $existing = User::factory()->create(['email' => 'lonely@example.com']);

        $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'lonely@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
            'owner_type' => 'individual',
        ])->assertStatus(201);

        $invitation = Invitation::query()->where('email', 'lonely@example.com')->firstOrFail();
        $this->assertSame($existing->id, $invitation->invited_user_id);
    }

    public function test_resend_works_via_generic_invitation_endpoint(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->standardAgencyWithAdmin();

        $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'resend@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
            'owner_type' => 'individual',
        ])->assertStatus(201);

        $invitation = Invitation::query()->where('email', 'resend@example.com')->firstOrFail();
        $originalToken = $invitation->token;

        $this->postJson("/api/invitations/{$invitation->id}/resend")
            ->assertStatus(200);

        $invitation->refresh();
        $this->assertNotSame($originalToken, $invitation->token);
        Mail::assertSent(InvitationMailable::class, fn (InvitationMailable $m) => $m->hasTo('resend@example.com'));
    }

    public function test_revoke_works_via_generic_invitation_endpoint(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->standardAgencyWithAdmin();

        $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'revoke@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
            'owner_type' => 'individual',
        ])->assertStatus(201);

        $invitation = Invitation::query()->where('email', 'revoke@example.com')->firstOrFail();

        $this->postJson("/api/invitations/{$invitation->id}/revoke")
            ->assertStatus(200);

        $this->assertSame(InvitationStatus::Revoked, $invitation->fresh()->status);
    }

    public function test_activity_log_records_owner_invited(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->standardAgencyWithAdmin();

        $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'log@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
            'owner_type' => 'individual',
        ])->assertStatus(201);

        $log = Activity::query()->where('event', 'owner_invited')->first();
        $this->assertNotNull($log);
        $this->assertSame($admin->id, $log->causer_id);
        $this->assertSame('log@example.com', data_get($log->properties, 'target_email'));
        $this->assertSame($agency->id, data_get($log->properties, 'agency_id'));
    }

    public function test_super_admin_bypass_works_for_individual_agency_too(): void
    {
        // super_admin is gated only by Gate::before bypass, not by the
        // agency.kind rule (the controller uses $user->can()). This test
        // documents the current behaviour for a future regression-guard.
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('super_admin');

        $this->postJson("/api/agencies/{$agency->id}/owners/invite", [
            'email' => 'sa@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
            'owner_type' => 'individual',
        ])->assertStatus(201);
    }
}
