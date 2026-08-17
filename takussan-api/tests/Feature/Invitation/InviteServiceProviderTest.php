<?php

namespace Tests\Feature\Invitation;

use App\Mail\InvitationMailable;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-260 — service provider invitation from the agency-side carnet
 * prestataires surface.
 *
 * Couvre :
 *  - AC1 : agence standard ou individual peut inviter
 *  - AC2 : listing carnet renvoie les SP rattachés à l'agence courante
 *  - AC4 : 409 si SP actif déjà dans l'agence
 *  - AC5 : flag `existing_sp_other_agency` exposé pour TCK-262
 *  - propagation `from_maintenance_request_id` dans metadata invitation
 *  - 403 si pas la permission, resend/revoke via routes génériques,
 *    activity log `service_provider_invited`.
 */
class InviteServiceProviderTest extends TestCase
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

    /**
     * @return array{Agency, User}
     */
    private function individualAgencyWithAdmin(): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $admin = $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        return [$agency, $admin];
    }

    public function test_agency_admin_can_invite_service_provider_in_standard_agency(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        $response = $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'email' => 'NewSP@example.com',
            'first_name' => 'Mamadou',
            'last_name' => 'Sow',
            'phone' => '+221770000010',
            'trades' => ['plumbing', 'electrical'],
            'intervention_zones' => ['Dakar', 'Mbour'],
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.email', 'newsp@example.com')
            ->assertJsonPath('data.role', 'service_provider')
            ->assertJsonPath('data.status', InvitationStatus::Sent->value)
            ->assertJsonPath('data.agency_id', $agency->id)
            ->assertJsonPath('meta.existing_sp_other_agency', false)
            ->assertJsonPath('meta.existing_sp_same_agency', false);

        $invitation = Invitation::query()->where('email', 'newsp@example.com')->firstOrFail();
        $this->assertSame(ServiceProviderProfile::class, $invitation->invitable_type);
        $this->assertNotNull($invitation->invitable_id);

        $this->assertDatabaseHas('service_provider_profiles', [
            'id' => $invitation->invitable_id,
            'status' => ServiceProviderProfileStatus::Draft->value,
            'user_id' => null,
        ]);

        $profile = ServiceProviderProfile::query()->find($invitation->invitable_id);
        $this->assertNotNull($profile);
        $this->assertSame(['plumbing', 'electrical'], $profile->specialties);
        $this->assertSame(['Dakar', 'Mbour'], $profile->service_areas);

        $this->assertDatabaseHas('service_provider_agency_collaborations', [
            'service_provider_profile_id' => $invitation->invitable_id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Paused->value,
        ]);

        Mail::assertSent(
            InvitationMailable::class,
            fn (InvitationMailable $m) => $m->hasTo('newsp@example.com'),
        );
    }

    public function test_individual_agency_admin_can_invite_service_provider(): void
    {
        Mail::fake();
        [$agency] = $this->individualAgencyWithAdmin();

        $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'email' => 'plombier@example.com',
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'trades' => ['plumbing'],
            'intervention_zones' => ['Dakar'],
        ])->assertStatus(201);
    }

    public function test_409_when_active_service_provider_already_in_agency(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        $existingUser = User::factory()->create(['email' => 'dup@example.com']);
        $existingProfile = ServiceProviderProfile::factory()->create([
            'user_id' => $existingUser->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $existingProfile->id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->toDateString(),
        ]);

        $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'email' => 'dup@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(409);
    }

    public function test_existing_sp_other_agency_flag_set_when_sp_exists_elsewhere(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        $otherAgency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $existingUser = User::factory()->create(['email' => 'shared@example.com']);
        $existingProfile = ServiceProviderProfile::factory()->create([
            'user_id' => $existingUser->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $existingProfile->id,
            'agency_id' => $otherAgency->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->toDateString(),
        ]);

        $response = $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'email' => 'shared@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('meta.existing_sp_other_agency', true);

        $invitation = Invitation::query()->where('email', 'shared@example.com')->firstOrFail();
        $this->assertTrue(data_get($invitation->metadata, 'existing_sp_other_agency'));
    }

    public function test_from_maintenance_request_id_propagated_to_invitation_metadata(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'email' => 'urgent@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
            'trades' => ['electrical'],
            'metadata' => ['from_maintenance_request_id' => 4242],
        ])->assertStatus(201);

        $invitation = Invitation::query()->where('email', 'urgent@example.com')->firstOrFail();
        $this->assertSame(4242, data_get($invitation->metadata, 'from_maintenance_request_id'));
    }

    public function test_agent_without_permission_gets_403(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agent', ['agency_id' => $agency->id]);

        $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'email' => 'x@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(403);
    }

    public function test_agent_with_invite_service_provider_permission_can_invite(): void
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

        $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'email' => 'delegated@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(201);
    }

    public function test_resend_works_via_generic_invitation_endpoint(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'email' => 'resend@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(201);

        $invitation = Invitation::query()->where('email', 'resend@example.com')->firstOrFail();
        $originalToken = $invitation->token;

        $this->postJson("/api/invitations/{$invitation->id}/resend")->assertStatus(200);

        $invitation->refresh();
        $this->assertNotSame($originalToken, $invitation->token);
        Mail::assertSent(
            InvitationMailable::class,
            fn (InvitationMailable $m) => $m->hasTo('resend@example.com'),
        );
    }

    public function test_revoke_works_via_generic_invitation_endpoint(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'email' => 'revoke@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(201);

        $invitation = Invitation::query()->where('email', 'revoke@example.com')->firstOrFail();

        $this->postJson("/api/invitations/{$invitation->id}/revoke")->assertStatus(200);

        $this->assertSame(InvitationStatus::Revoked, $invitation->fresh()->status);
    }

    public function test_index_returns_only_service_providers_attached_to_this_agency(): void
    {
        Mail::fake();
        [$agency] = $this->standardAgencyWithAdmin();

        // SP rattaché à notre agence
        $userOurs = User::factory()->create();
        $ours = ServiceProviderProfile::factory()->create([
            'user_id' => $userOurs->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $ours->id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->toDateString(),
        ]);

        // SP rattaché à une autre agence — ne doit PAS apparaître
        $otherAgency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $userOther = User::factory()->create();
        $other = ServiceProviderProfile::factory()->create([
            'user_id' => $userOther->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $other->id,
            'agency_id' => $otherAgency->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->toDateString(),
        ]);

        $response = $this->getJson("/api/agencies/{$agency->id}/service-providers?fields[service_provider_profiles]=id,status");
        $response->assertStatus(200);

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($ours->id, $ids);
        $this->assertNotContains($other->id, $ids);
    }

    public function test_activity_log_records_service_provider_invited(): void
    {
        Mail::fake();
        [$agency, $admin] = $this->standardAgencyWithAdmin();

        $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'email' => 'log@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(201);

        $log = Activity::query()->where('event', 'service_provider_invited')->first();
        $this->assertNotNull($log);
        $this->assertSame($admin->id, $log->causer_id);
        $this->assertSame('log@example.com', data_get($log->properties, 'target_email'));
        $this->assertSame($agency->id, data_get($log->properties, 'agency_id'));
    }

    public function test_super_admin_bypass_works(): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('super_admin');

        $this->postJson("/api/agencies/{$agency->id}/service-providers/invite", [
            'email' => 'sa@example.com',
            'first_name' => 'A',
            'last_name' => 'B',
        ])->assertStatus(201);
    }
}
