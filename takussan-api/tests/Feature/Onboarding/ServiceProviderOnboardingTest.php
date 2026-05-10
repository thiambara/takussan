<?php

namespace Tests\Feature\Onboarding;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\DocumentType;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;

/**
 * TCK-261 — covers the post-acceptance Service Provider wizard:
 *  1. Acceptance hook attaches User on the draft SP profile.
 *  2. PATCH trades / availability persistence.
 *  3. POST kyc/upload accepts CNI + insurance + creates Document rows.
 *  4. complete() OTP gate, status flip, collaborations bumped, cookie set.
 *  5. Activity log entries (sp_kyc_submitted, sp_phone_verified,
 *     sp_onboarding_completed).
 *  6. Authorization (401 unauth, 403 wrong owner).
 */
class ServiceProviderOnboardingTest extends BaseTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ensureRolesSeeded();
        // medialibrary writes to disk during the upload tests — point at
        // a fake disk so the suite stays isolated.
        Storage::fake(config('media-library.disk_name', 'public'));
    }

    /**
     * @return array{Agency, ServiceProviderProfile, ServiceProviderAgencyCollaboration, Invitation}
     */
    private function draftSpInvitedByAgency(?array $invitationMetadata = null): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $sp = ServiceProviderProfile::factory()->draft()->create();
        $collab = ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $sp->id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Paused->value,
            'started_at' => now()->toDateString(),
            'metadata' => null,
        ]);
        $invitation = Invitation::factory()->create([
            'email' => $sp->draft_email ?? 'sp@example.com',
            'role' => 'service_provider',
            'invitable_type' => ServiceProviderProfile::class,
            'invitable_id' => $sp->id,
            'agency_id' => $agency->id,
            'status' => InvitationStatus::Sent->value,
            'metadata' => $invitationMetadata,
        ]);

        return [$agency, $sp, $collab, $invitation];
    }

    public function test_invitation_acceptance_attaches_user_and_activates_sp_profile(): void
    {
        [, $sp, , $invitation] = $this->draftSpInvitedByAgency();

        $response = $this->postJson("/api/invitations/{$invitation->token}/accept", [
            'first_name' => 'Demba',
            'last_name' => 'Sow',
            'password' => 'Secret123!',
        ]);

        $response->assertOk();

        $sp->refresh();
        $this->assertNotNull($sp->user_id);
        $this->assertSame(ServiceProviderProfileStatus::Active, $sp->status);

        $invitation->refresh();
        $this->assertSame(InvitationStatus::Accepted, $invitation->status);
        $this->assertSame($sp->user_id, $invitation->invited_user_id);
    }

    public function test_patch_trades_persists_specialties_zones_and_rates(): void
    {
        $user = User::factory()->create();
        $sp = ServiceProviderProfile::factory()->create(['user_id' => $user->id]);
        Sanctum::actingAs($user);

        $response = $this->patchJson("/api/me/profiles/{$sp->id}/trades", [
            'trades' => ['plumbing', 'electrical', 'plumbing'],
            'intervention_zones' => ['Dakar', 'Mbour'],
            'hourly_rate' => 4500,
            'visit_fee' => 2500,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.trades', ['plumbing', 'electrical'])
            ->assertJsonPath('data.intervention_zones', ['Dakar', 'Mbour'])
            ->assertJsonPath('data.visit_fee', 2500);

        $sp->refresh();
        $this->assertSame(['plumbing', 'electrical'], $sp->specialties);
        $this->assertSame(['Dakar', 'Mbour'], $sp->service_areas);
        $this->assertSame('4500.00', (string) $sp->hourly_rate_min);
        $this->assertSame(2500.0, (float) data_get($sp->metadata, 'visit_fee'));
    }

    public function test_patch_availability_persists_slots_under_metadata(): void
    {
        $user = User::factory()->create();
        $sp = ServiceProviderProfile::factory()->create(['user_id' => $user->id]);
        Sanctum::actingAs($user);

        $slots = [
            ['day' => 'monday', 'from' => '08:00', 'to' => '12:00'],
            ['day' => 'monday', 'from' => '14:00', 'to' => '18:00'],
            ['day' => 'wednesday', 'from' => '09:00', 'to' => '17:00'],
        ];

        $this->patchJson("/api/me/profiles/{$sp->id}/availability", [
            'available_slots' => $slots,
        ])->assertOk()->assertJsonPath('data.available_slots', $slots);

        $sp->refresh();
        $this->assertSame($slots, data_get($sp->metadata, 'availability'));
    }

    public function test_kyc_upload_accepts_cni_and_insurance(): void
    {
        $user = User::factory()->create();
        $sp = ServiceProviderProfile::factory()->create(['user_id' => $user->id]);
        Sanctum::actingAs($user);

        $cni = UploadedFile::fake()->image('cni.jpg');
        $this->postJson("/api/me/profiles/{$sp->id}/kyc/upload", [
            'file' => $cni,
            'kind' => 'cni',
        ])->assertCreated()
            ->assertJsonPath('data.kind', 'cni')
            ->assertJsonPath('data.type', DocumentType::IdCard->value);

        $insurance = UploadedFile::fake()->create('insurance.pdf', 200, 'application/pdf');
        $this->postJson("/api/me/profiles/{$sp->id}/kyc/upload", [
            'file' => $insurance,
            'kind' => 'insurance',
        ])->assertCreated()
            ->assertJsonPath('data.kind', 'insurance')
            ->assertJsonPath('data.type', DocumentType::Insurance->value);

        $this->assertSame(2, Document::query()
            ->where('documentable_type', ServiceProviderProfile::class)
            ->where('documentable_id', $sp->id)
            ->count());

        $sp->refresh();
        $this->assertTrue((bool) data_get($sp->metadata, 'has_insurance'));

        // Activity log
        $this->assertTrue(Activity::query()
            ->where('event', 'sp_kyc_submitted')
            ->where('causer_id', $user->id)
            ->exists());
    }

    public function test_complete_rejects_invalid_otp_and_does_not_persist_anything(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => null,
        ]);
        $sp = ServiceProviderProfile::factory()->create([
            'user_id' => $user->id,
            'status' => ServiceProviderProfileStatus::Draft->value,
        ]);
        $agency = Agency::factory()->create();
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $sp->id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Paused->value,
            'started_at' => now()->toDateString(),
        ]);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/service-provider/onboard/complete', [
            'sp_profile_id' => $sp->id,
            'phone_otp' => ['code' => '999999'],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['phone_otp.code']);

        // SP still draft, collab still paused.
        $sp->refresh();
        $this->assertSame(ServiceProviderProfileStatus::Draft, $sp->status);
        $collab = $sp->agencyCollaborations()->first();
        $this->assertSame(CollaborationStatus::Paused, $collab->status);
    }

    public function test_complete_flips_status_collaborations_and_returns_redirect_id(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => null,
        ]);
        $sp = ServiceProviderProfile::factory()->create([
            'user_id' => $user->id,
            'status' => ServiceProviderProfileStatus::Draft->value,
        ]);
        $agency = Agency::factory()->create();
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $sp->id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Paused->value,
            'started_at' => now()->toDateString(),
        ]);
        Invitation::factory()->create([
            'email' => $user->email,
            'role' => 'service_provider',
            'invitable_type' => ServiceProviderProfile::class,
            'invitable_id' => $sp->id,
            'agency_id' => $agency->id,
            'status' => InvitationStatus::Accepted->value,
            'accepted_at' => now(),
            'metadata' => ['from_maintenance_request_id' => 4242],
        ]);
        Sanctum::actingAs($user);

        // Real OTP through the service so the prod path is exercised.
        $code = app(PhoneVerificationService::class)->sendOtp($user);
        $this->assertNotNull($code);

        $response = $this->postJson('/api/service-provider/onboard/complete', [
            'sp_profile_id' => $sp->id,
            'phone_otp' => ['code' => $code],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.sp_profile.status', ServiceProviderProfileStatus::Active->value)
            ->assertJsonPath('data.activated_collaborations', 1)
            ->assertJsonPath('data.redirect_to_maintenance_request_id', 4242)
            ->assertJsonPath('data.active_profile_id', "service_provider:{$sp->id}");

        // Cookie set.
        $cookieNames = array_map(fn ($c) => $c->getName(), $response->headers->getCookies());
        $this->assertContains('active_profile_id', $cookieNames);

        $this->assertNotNull($user->fresh()->phone_verified_at);

        // Activity entries.
        $this->assertTrue(Activity::query()->where('event', 'sp_onboarding_completed')->exists());
        $this->assertTrue(Activity::query()->where('event', 'sp_phone_verified')->exists());
    }

    public function test_endpoints_require_authentication(): void
    {
        $sp = ServiceProviderProfile::factory()->create();

        $this->patchJson("/api/me/profiles/{$sp->id}/trades", [])->assertStatus(401);
        $this->patchJson("/api/me/profiles/{$sp->id}/availability", [
            'available_slots' => [],
        ])->assertStatus(401);
        $this->postJson("/api/me/profiles/{$sp->id}/kyc/upload", [])->assertStatus(401);
        $this->postJson('/api/service-provider/onboard/complete', [
            'sp_profile_id' => $sp->id,
        ])->assertStatus(401);
    }

    public function test_other_user_cannot_write_to_someone_else_sp_profile(): void
    {
        $owner = User::factory()->create();
        $sp = ServiceProviderProfile::factory()->create(['user_id' => $owner->id]);

        $intruder = User::factory()->create();
        Sanctum::actingAs($intruder);

        $this->patchJson("/api/me/profiles/{$sp->id}/trades", [
            'trades' => ['plumbing'],
        ])->assertStatus(403);

        $this->postJson('/api/service-provider/onboard/complete', [
            'sp_profile_id' => $sp->id,
        ])->assertStatus(403);
    }
}
