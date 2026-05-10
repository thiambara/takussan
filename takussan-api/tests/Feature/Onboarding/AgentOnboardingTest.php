<?php

namespace Tests\Feature\Onboarding;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\DocumentType;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;

/**
 * TCK-259 — covers the post-acceptance Agent wizard:
 *  1. Acceptance hook attaches User on the draft Agent profile + flips status.
 *  2. POST kyc/upload accepts license + cni + photo + creates Document rows.
 *  3. POST kyc/submit marks the dossier as submitted.
 *  4. PATCH specialization persists specialty + intervention_zones.
 *  5. complete() OTP gate, status flip, cookie set, first_lead surfaced.
 *  6. GET /api/me/agent-profiles/{id}/first-lead returns pre-assigned lead
 *     (and null when none).
 *  7. Activity log entries (agent_kyc_submitted, agent_phone_verified,
 *     agent_onboarding_completed).
 *  8. Authorization (401 unauth, 403 wrong owner).
 */
class AgentOnboardingTest extends BaseTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ensureRolesSeeded();
        Storage::fake(config('media-library.disk_name', 'public'));
    }

    /**
     * @return array{Agency, AgentProfile, Invitation}
     */
    private function draftAgentInvitedByAgency(): array
    {
        $agency = Agency::factory()->create();
        $agent = AgentProfile::factory()->draft()->create([
            'agency_id' => $agency->id,
        ]);
        $invitation = Invitation::factory()->create([
            'email' => $agent->draft_email ?? 'agent@example.com',
            'role' => 'agent',
            'invitable_type' => AgentProfile::class,
            'invitable_id' => $agent->id,
            'agency_id' => $agency->id,
            'status' => InvitationStatus::Sent->value,
        ]);

        return [$agency, $agent, $invitation];
    }

    public function test_invitation_acceptance_attaches_user_and_activates_agent_profile(): void
    {
        [, $agent, $invitation] = $this->draftAgentInvitedByAgency();

        $response = $this->postJson("/api/invitations/{$invitation->token}/accept", [
            'first_name' => 'Aïssatou',
            'last_name' => 'Sow',
            'password' => 'Secret123!',
        ]);

        $response->assertOk();

        $agent->refresh();
        $this->assertNotNull($agent->user_id);
        $this->assertSame(AgentProfileStatus::Active, $agent->status);

        $invitation->refresh();
        $this->assertSame(InvitationStatus::Accepted, $invitation->status);
        $this->assertSame($agent->user_id, $invitation->invited_user_id);
    }

    public function test_kyc_upload_accepts_license_cni_and_photo(): void
    {
        $user = User::factory()->create();
        $agent = AgentProfile::factory()->create(['user_id' => $user->id]);
        Sanctum::actingAs($user);

        $license = UploadedFile::fake()->image('license.jpg');
        $this->postJson("/api/me/agent-profiles/{$agent->id}/kyc/upload", [
            'file' => $license,
            'kind' => 'license',
        ])->assertCreated()
            ->assertJsonPath('data.kind', 'license')
            ->assertJsonPath('data.type', DocumentType::Other->value);

        $cni = UploadedFile::fake()->create('cni.pdf', 200, 'application/pdf');
        $this->postJson("/api/me/agent-profiles/{$agent->id}/kyc/upload", [
            'file' => $cni,
            'kind' => 'cni',
        ])->assertCreated()
            ->assertJsonPath('data.type', DocumentType::IdCard->value);

        $photo = UploadedFile::fake()->image('photo.jpg');
        $this->postJson("/api/me/agent-profiles/{$agent->id}/kyc/upload", [
            'file' => $photo,
            'kind' => 'photo',
        ])->assertCreated()
            ->assertJsonPath('data.type', DocumentType::Photo->value);

        $this->assertSame(3, Document::query()
            ->where('documentable_type', AgentProfile::class)
            ->where('documentable_id', $agent->id)
            ->count());

        $agent->refresh();
        $docs = (array) data_get($agent->metadata, 'kyc.docs');
        sort($docs);
        $this->assertSame(['cni', 'license', 'photo'], $docs);

        $this->assertTrue(Activity::query()
            ->where('event', 'agent_kyc_submitted')
            ->where('causer_id', $user->id)
            ->exists());
    }

    public function test_kyc_submit_marks_dossier_as_pending_review(): void
    {
        $user = User::factory()->create();
        $agent = AgentProfile::factory()->create(['user_id' => $user->id]);
        Sanctum::actingAs($user);

        $response = $this->postJson("/api/me/agent-profiles/{$agent->id}/kyc/submit");

        $response->assertOk()
            ->assertJsonPath('data.kyc.status', 'pending_review')
            ->assertJsonPath('data.id', $agent->id);

        $agent->refresh();
        $this->assertSame('pending_review', data_get($agent->metadata, 'kyc.status'));
        $this->assertNotEmpty(data_get($agent->metadata, 'kyc.submitted_at'));
    }

    public function test_specialization_endpoint_persists_specialty_and_zones(): void
    {
        $user = User::factory()->create();
        $agent = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'specialty' => null,
            'license_number' => null,
        ]);
        Sanctum::actingAs($user);

        $response = $this->patchJson("/api/me/agent-profiles/{$agent->id}/specialization", [
            'specialization' => 'luxury',
            'intervention_zones' => ['Almadies', 'Plateau', 'Plateau'],
            'license_number' => 'AGT-2026-001',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.specialization', 'luxury')
            ->assertJsonPath('data.license_number', 'AGT-2026-001')
            ->assertJsonPath('data.intervention_zones.0', 'Almadies')
            ->assertJsonPath('data.intervention_zones.1', 'Plateau');

        $agent->refresh();
        $this->assertSame('luxury', $agent->specialty);
        $this->assertSame('AGT-2026-001', $agent->license_number);
        $this->assertSame(['Almadies', 'Plateau'], (array) data_get($agent->metadata, 'intervention_zones'));
    }

    public function test_specialization_rejects_unknown_value(): void
    {
        $user = User::factory()->create();
        $agent = AgentProfile::factory()->create(['user_id' => $user->id]);
        Sanctum::actingAs($user);

        $this->patchJson("/api/me/agent-profiles/{$agent->id}/specialization", [
            'specialization' => 'industrial',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['specialization']);
    }

    public function test_complete_rejects_invalid_otp_and_does_not_persist_anything(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => null,
        ]);
        $agent = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'status' => AgentProfileStatus::Draft->value,
        ]);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/agent/onboard/complete', [
            'agent_profile_id' => $agent->id,
            'phone_otp' => ['code' => '999999'],
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['phone_otp.code']);

        $agent->refresh();
        $this->assertSame(AgentProfileStatus::Draft, $agent->status);
        $this->assertNull($user->fresh()->phone_verified_at);
    }

    public function test_complete_flips_status_pins_cookie_and_returns_first_lead(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => null,
        ]);
        $agency = Agency::factory()->create();
        $agent = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'status' => AgentProfileStatus::Draft->value,
        ]);
        // Pre-assigned lead (created by the agency before invite,
        // attributed to this agent via `added_by_id`).
        $lead = Customer::factory()->create([
            'added_by_id' => $user->id,
            'agency_id' => $agency->id,
            'first_name' => 'Mariama',
            'last_name' => 'Ba',
        ]);
        // Stray customer NOT in this agency — must NOT be picked.
        Customer::factory()->create([
            'added_by_id' => $user->id,
            'agency_id' => Agency::factory()->create()->id,
        ]);

        Sanctum::actingAs($user);

        $code = app(PhoneVerificationService::class)->sendOtp($user);
        $this->assertNotNull($code);

        $response = $this->postJson('/api/agent/onboard/complete', [
            'agent_profile_id' => $agent->id,
            'phone_otp' => ['code' => $code],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.agent_profile.status', AgentProfileStatus::Active->value)
            ->assertJsonPath('data.first_lead.id', $lead->id)
            ->assertJsonPath('data.first_lead.full_name', 'Mariama Ba')
            ->assertJsonPath('data.active_profile_id', "agent:{$agent->id}");

        $cookieNames = array_map(fn ($c) => $c->getName(), $response->headers->getCookies());
        $this->assertContains('active_profile_id', $cookieNames);

        $this->assertNotNull($user->fresh()->phone_verified_at);

        $this->assertTrue(Activity::query()->where('event', 'agent_onboarding_completed')->exists());
        $this->assertTrue(Activity::query()->where('event', 'agent_phone_verified')->exists());
    }

    public function test_first_lead_endpoint_returns_pre_assigned_customer_and_null_when_none(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        $agent = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
        ]);
        Sanctum::actingAs($user);

        // Empty case first.
        $this->getJson("/api/me/agent-profiles/{$agent->id}/first-lead")
            ->assertOk()
            ->assertJsonPath('data.customer', null);

        $lead = Customer::factory()->create([
            'added_by_id' => $user->id,
            'agency_id' => $agency->id,
            'first_name' => 'Fatou',
            'last_name' => 'Ndiaye',
        ]);

        $this->getJson("/api/me/agent-profiles/{$agent->id}/first-lead")
            ->assertOk()
            ->assertJsonPath('data.customer.id', $lead->id)
            ->assertJsonPath('data.customer.full_name', 'Fatou Ndiaye');
    }

    public function test_endpoints_require_authentication(): void
    {
        $agent = AgentProfile::factory()->create();

        $this->postJson("/api/me/agent-profiles/{$agent->id}/kyc/upload", [])->assertStatus(401);
        $this->postJson("/api/me/agent-profiles/{$agent->id}/kyc/submit")->assertStatus(401);
        $this->patchJson("/api/me/agent-profiles/{$agent->id}/specialization", [])->assertStatus(401);
        $this->getJson("/api/me/agent-profiles/{$agent->id}/first-lead")->assertStatus(401);
        $this->postJson('/api/agent/onboard/complete', [
            'agent_profile_id' => $agent->id,
        ])->assertStatus(401);
    }

    public function test_other_user_cannot_write_to_someone_else_agent_profile(): void
    {
        $agent = AgentProfile::factory()->create();
        $intruder = User::factory()->create();
        Sanctum::actingAs($intruder);

        $this->postJson("/api/me/agent-profiles/{$agent->id}/kyc/submit")->assertStatus(403);
        $this->patchJson("/api/me/agent-profiles/{$agent->id}/specialization", [
            'specialization' => 'luxury',
        ])->assertStatus(403);
        $this->postJson('/api/agent/onboard/complete', [
            'agent_profile_id' => $agent->id,
        ])->assertStatus(403);
    }
}
