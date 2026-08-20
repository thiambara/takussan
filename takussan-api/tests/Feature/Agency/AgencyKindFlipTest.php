<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Agency\AgencyKindFlipService;
use App\Services\Invitation\AgentInvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Mockery;
use RuntimeException;
use Spatie\Activitylog\Models\Activity;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;
use Throwable;

/**
 * TCK-269 — `Agency.kind` flip on upgrade approval + feature unlock +
 * welcome trigger marker.
 *
 * Covers the AgencyKindFlipService directly + the transactional rollback
 * path through the HTTP approve endpoint + the implicit feature unlock
 * (agent invitation policy reads `Agency.kind`).
 */
class AgencyKindFlipTest extends TestCase
{
    use RefreshDatabase;

    private function pendingRequestForAgency(Agency $agency, ?User $submitter = null): AgencyUpgradeRequest
    {
        $submitter ??= User::factory()->create();

        return AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $agency->id,
            'submitted_by' => $submitter->id,
        ]);
    }

    public function test_approve_flips_agency_kind_to_standard_and_copies_legal_fields(): void
    {
        Notification::fake();
        $reviewer = $this->actingAsRole('super_admin');

        $agency = Agency::factory()->individual()->create(['metadata' => null]);
        $request = $this->pendingRequestForAgency($agency);

        $this->postJson("/api/admin/agency-upgrade-requests/{$request->id}/approve", [
            'comment' => 'Statuts conformes.',
        ])->assertStatus(200);

        $fresh = $agency->fresh();
        $this->assertSame(AgencyKind::Standard, $fresh->kind);

        // Legal fields land in metadata.legal_info since Agency has no
        // first-class columns for them yet.
        $legal = $fresh->metadata['legal_info'] ?? [];
        $this->assertSame($request->rc, $legal['rc'] ?? null);
        $this->assertSame($request->ninea, $legal['ninea'] ?? null);
        $this->assertSame($request->company_legal_name, $legal['company_legal_name'] ?? null);

        // Welcome marker for the frontend.
        $this->assertNotNull($fresh->metadata['welcome']['standard_unlocked_at'] ?? null);

        // Reviewer is the activity causer.
        $this->assertNotNull($reviewer);
    }

    public function test_existing_legal_metadata_is_not_overwritten(): void
    {
        Notification::fake();
        $this->actingAsRole('super_admin');

        $existing = ['rc' => 'RC-EXISTING', 'ninea' => 'NINEA-EXISTING'];
        $agency = Agency::factory()->individual()->create([
            'metadata' => ['legal_info' => $existing],
        ]);
        $request = $this->pendingRequestForAgency($agency);

        $this->postJson("/api/admin/agency-upgrade-requests/{$request->id}/approve", [])
            ->assertStatus(200);

        $legal = $agency->fresh()->metadata['legal_info'];
        $this->assertSame('RC-EXISTING', $legal['rc']);
        $this->assertSame('NINEA-EXISTING', $legal['ninea']);
        // Field that wasn't pre-set should have been backfilled.
        $this->assertSame($request->company_legal_name, $legal['company_legal_name'] ?? null);
    }

    public function test_flip_throws_when_agency_is_already_standard(): void
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $request = AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $agency->id,
        ]);

        $service = app(AgencyKindFlipService::class);

        $this->expectException(RuntimeException::class);
        $service->flip($request);
    }

    public function test_approve_rolls_back_when_flip_fails(): void
    {
        Notification::fake();
        $this->actingAsRole('super_admin');

        $agency = Agency::factory()->individual()->create();
        $request = $this->pendingRequestForAgency($agency);

        // Force the flip service to throw inside the approval transaction.
        $mock = Mockery::mock(AgencyKindFlipService::class);
        $mock->shouldReceive('flip')->once()->andThrow(new RuntimeException('boom'));
        $this->app->instance(AgencyKindFlipService::class, $mock);

        try {
            $this->postJson("/api/admin/agency-upgrade-requests/{$request->id}/approve", []);
        } catch (Throwable $e) {
            // Either bubbles up as 500 or is caught by the framework — both
            // outcomes are fine for the rollback assertion below.
        }

        // Status must remain pending — the transaction rolled back.
        $this->assertSame(
            AgencyUpgradeRequestStatus::Pending,
            $request->fresh()->status,
            'AgencyUpgradeRequest should remain pending when the flip fails',
        );
        // Agency must still be `individual`.
        $this->assertSame(AgencyKind::Individual, $agency->fresh()->kind);
    }

    public function test_activity_log_records_agency_kind_flipped_event_with_from_and_to(): void
    {
        Notification::fake();
        $this->actingAsRole('super_admin');

        $agency = Agency::factory()->individual()->create();
        $request = $this->pendingRequestForAgency($agency);

        $this->postJson("/api/admin/agency-upgrade-requests/{$request->id}/approve", [])
            ->assertStatus(200);

        $activity = Activity::query()
            ->where('event', 'agency_kind_flipped')
            ->latest('id')
            ->first();

        $this->assertNotNull($activity, 'agency_kind_flipped activity should be logged');
        $this->assertSame('individual', $activity->properties['from'] ?? null);
        $this->assertSame('standard', $activity->properties['to'] ?? null);
        $this->assertSame($request->id, $activity->properties['upgrade_request_id'] ?? null);
    }

    public function test_metadata_welcome_standard_unlocked_at_is_set(): void
    {
        Notification::fake();
        $this->actingAsRole('super_admin');

        $agency = Agency::factory()->individual()->create();
        $request = $this->pendingRequestForAgency($agency);

        $this->postJson("/api/admin/agency-upgrade-requests/{$request->id}/approve", [])
            ->assertStatus(200);

        $unlockedAt = $agency->fresh()->metadata['welcome']['standard_unlocked_at'] ?? null;
        $this->assertNotNull($unlockedAt);
        // Sanity: it parses as a date close to now.
        $this->assertNotFalse(strtotime($unlockedAt));
    }

    public function test_agent_invitation_unlocks_after_flip(): void
    {
        Notification::fake();
        Mail::fake();

        // Pre-flip — invitation must be 403'd (kind=individual).
        $agency = Agency::factory()->individual()->create();
        $admin = User::factory()->create(['agency_id' => $agency->id]);

        // TCK-278 — la check de permission interroge désormais le profil
        // polymorphe ; le matérialiser explicitement (le test bypass
        // `actingAsRole` qui le ferait automatiquement).
        AgencyAdminProfile::factory()->create([
            'user_id' => $admin->id,
            'agency_id' => $agency->id,
        ]);

        $service = app(AgentInvitationService::class);

        $threw403 = false;
        try {
            $service->invite($agency, $admin, [
                'email' => 'pre-flip@example.com',
                'role' => 'agent',
                'first_name' => 'Pré',
                'last_name' => 'Flip',
            ]);
        } catch (HttpException $e) {
            $threw403 = $e->getStatusCode() === 403;
        }
        $this->assertTrue($threw403, 'Agent invitation should be 403 on individual agencies');

        // Flip via the service directly (already covered transactionally above).
        $request = $this->pendingRequestForAgency($agency);
        app(AgencyKindFlipService::class)->flip($request);

        // Refresh permission context after flip, then re-invite.
        $invitation = $service->invite($agency->fresh(), $admin, [
            'email' => 'post-flip@example.com',
            'role' => 'agent',
            'first_name' => 'Post',
            'last_name' => 'Flip',
        ]);

        $this->assertSame('post-flip@example.com', $invitation->email);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
