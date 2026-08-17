<?php

namespace Tests\Feature\Onboarding;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-257 — covers the post-acceptance Owner wizard:
 *  1. Acceptance hook attaches User on the draft Owner profile + flips status.
 *  2. POST kyc/upload accepts CNI + RIB + NINEA + creates Document rows.
 *  3. POST kyc/submit marks the dossier as submitted.
 *  4. complete() OTP gate, status flip, cookie set, properties_count returned.
 *  5. GET /api/me/owner-profiles/{id}/properties returns pre-attached props.
 *  6. Activity log entries (owner_kyc_submitted, owner_phone_verified,
 *     owner_onboarding_completed).
 *  7. Authorization (401 unauth, 403 wrong owner).
 */
class OwnerOnboardingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name', 'public'));
    }

    /**
     * @return array{Agency, OwnerProfile, Invitation}
     */
    private function draftOwnerInvitedByAgency(): array
    {
        $agency = Agency::factory()->create();
        $owner = OwnerProfile::factory()->draft()->create([
            'agency_id' => $agency->id,
        ]);
        $invitation = Invitation::factory()->create([
            'email' => $owner->draft_email ?? 'owner@example.com',
            'role' => 'owner',
            'invitable_type' => OwnerProfile::class,
            'invitable_id' => $owner->id,
            'agency_id' => $agency->id,
            'status' => InvitationStatus::Sent->value,
        ]);

        return [$agency, $owner, $invitation];
    }

    public function test_invitation_acceptance_attaches_user_and_activates_owner_profile(): void
    {
        [, $owner, $invitation] = $this->draftOwnerInvitedByAgency();

        $response = $this->postJson("/api/invitations/{$invitation->token}/accept", [
            'first_name' => 'Aminata',
            'last_name' => 'Diop',
            'password' => 'Secret123!',
        ]);

        $response->assertOk();

        $owner->refresh();
        $this->assertNotNull($owner->user_id);
        $this->assertSame(OwnerProfileStatus::Active, $owner->status);

        $invitation->refresh();
        $this->assertSame(InvitationStatus::Accepted, $invitation->status);
        $this->assertSame($owner->user_id, $invitation->invited_user_id);
    }

    public function test_kyc_upload_accepts_cni_rib_and_ninea(): void
    {
        $user = User::factory()->create();
        $owner = OwnerProfile::factory()->create(['user_id' => $user->id]);
        Sanctum::actingAs($user);

        $cni = UploadedFile::fake()->image('cni.jpg');
        $this->postJson("/api/me/owner-profiles/{$owner->id}/kyc/upload", [
            'file' => $cni,
            'kind' => 'cni',
        ])->assertCreated()
            ->assertJsonPath('data.kind', 'cni')
            ->assertJsonPath('data.type', DocumentType::IdCard->value);

        $rib = UploadedFile::fake()->create('rib.pdf', 200, 'application/pdf');
        $this->postJson("/api/me/owner-profiles/{$owner->id}/kyc/upload", [
            'file' => $rib,
            'kind' => 'rib',
        ])->assertCreated()
            ->assertJsonPath('data.type', DocumentType::Rib->value);

        $ninea = UploadedFile::fake()->create('ninea.pdf', 200, 'application/pdf');
        $this->postJson("/api/me/owner-profiles/{$owner->id}/kyc/upload", [
            'file' => $ninea,
            'kind' => 'ninea',
        ])->assertCreated()
            ->assertJsonPath('data.type', DocumentType::Ninea->value);

        $this->assertSame(3, Document::query()
            ->where('documentable_type', OwnerProfile::class)
            ->where('documentable_id', $owner->id)
            ->count());

        $owner->refresh();
        $docs = (array) data_get($owner->metadata, 'kyc.docs');
        sort($docs);
        $this->assertSame(['cni', 'ninea', 'rib'], $docs);

        $this->assertTrue(Activity::query()
            ->where('event', 'owner_kyc_submitted')
            ->where('causer_id', $user->id)
            ->exists());
    }

    public function test_kyc_submit_marks_dossier_as_pending_review(): void
    {
        $user = User::factory()->create();
        $owner = OwnerProfile::factory()->create(['user_id' => $user->id]);
        Sanctum::actingAs($user);

        $response = $this->postJson("/api/me/owner-profiles/{$owner->id}/kyc/submit");

        $response->assertOk()
            ->assertJsonPath('data.kyc.status', 'pending_review')
            ->assertJsonPath('data.id', $owner->id);

        $owner->refresh();
        $this->assertSame('pending_review', data_get($owner->metadata, 'kyc.status'));
        $this->assertNotEmpty(data_get($owner->metadata, 'kyc.submitted_at'));
    }

    public function test_complete_rejects_invalid_otp_and_does_not_persist_anything(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => null,
        ]);
        $owner = OwnerProfile::factory()->create([
            'user_id' => $user->id,
            'status' => OwnerProfileStatus::Draft->value,
        ]);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/owner/onboard/complete', [
            'owner_profile_id' => $owner->id,
            'phone_otp' => ['code' => '999999'],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['phone_otp.code']);

        $owner->refresh();
        $this->assertSame(OwnerProfileStatus::Draft, $owner->status);
        $this->assertNull($user->fresh()->phone_verified_at);
    }

    public function test_complete_flips_status_pins_cookie_and_returns_properties_count(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => null,
        ]);
        $agency = Agency::factory()->create();
        $owner = OwnerProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'status' => OwnerProfileStatus::Draft->value,
        ]);
        // Pre-attached properties (created by the agency before invite).
        Property::factory()->count(2)->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
        ]);
        // Stray property NOT in this agency — must NOT be counted.
        Property::factory()->create([
            'user_id' => $user->id,
            'agency_id' => Agency::factory()->create()->id,
        ]);

        Sanctum::actingAs($user);

        $code = app(PhoneVerificationService::class)->sendOtp($user);
        $this->assertNotNull($code);

        $response = $this->postJson('/api/owner/onboard/complete', [
            'owner_profile_id' => $owner->id,
            'phone_otp' => ['code' => $code],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.owner_profile.status', OwnerProfileStatus::Active->value)
            ->assertJsonPath('data.properties_count', 2)
            ->assertJsonPath('data.active_profile_id', "owner:{$owner->id}");

        $cookieNames = array_map(fn ($c) => $c->getName(), $response->headers->getCookies());
        $this->assertContains('active_profile_id', $cookieNames);

        $this->assertNotNull($user->fresh()->phone_verified_at);

        $this->assertTrue(Activity::query()->where('event', 'owner_onboarding_completed')->exists());
        $this->assertTrue(Activity::query()->where('event', 'owner_phone_verified')->exists());
    }

    public function test_properties_endpoint_returns_only_pre_attached_properties(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        $owner = OwnerProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
        ]);

        Property::factory()->count(3)->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
        ]);
        // Other-agency property — must NOT appear.
        Property::factory()->create([
            'user_id' => $user->id,
            'agency_id' => Agency::factory()->create()->id,
        ]);
        // Other-user property in same agency — must NOT appear.
        Property::factory()->create([
            'user_id' => User::factory()->create()->id,
            'agency_id' => $agency->id,
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson("/api/me/owner-profiles/{$owner->id}/properties?fields[properties]=id,title");

        $response->assertOk()
            ->assertJsonPath('meta.total', 3);
    }

    public function test_endpoints_require_authentication(): void
    {
        $owner = OwnerProfile::factory()->create();

        $this->postJson("/api/me/owner-profiles/{$owner->id}/kyc/upload", [])->assertStatus(401);
        $this->postJson("/api/me/owner-profiles/{$owner->id}/kyc/submit")->assertStatus(401);
        $this->getJson("/api/me/owner-profiles/{$owner->id}/properties")->assertStatus(401);
        $this->postJson('/api/owner/onboard/complete', [
            'owner_profile_id' => $owner->id,
        ])->assertStatus(401);
    }

    public function test_other_user_cannot_write_to_someone_else_owner_profile(): void
    {
        $owner = OwnerProfile::factory()->create();
        $intruder = User::factory()->create();
        Sanctum::actingAs($intruder);

        $this->postJson("/api/me/owner-profiles/{$owner->id}/kyc/submit")->assertStatus(403);
        $this->postJson('/api/owner/onboard/complete', [
            'owner_profile_id' => $owner->id,
        ])->assertStatus(403);
    }
}
