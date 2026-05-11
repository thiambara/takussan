<?php

namespace Tests\Feature\Admin;

use App\Events\AgencyUpgradeApproved;
use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\User;
use App\Notifications\AgencyUpgradeApprovedNotification;
use App\Notifications\AgencyUpgradeRejectedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;

/**
 * TCK-268 — super-admin upgrade-review console.
 *
 * Covers list/detail visibility (cross-agency), approve / reject lifecycle,
 * 422 guards on already-decided requests, validation of the rejection
 * comment, AgencyUpgradeApproved event dispatch, submitter notifications,
 * and activity log entries.
 */
class AgencyUpgradeRequestReviewTest extends BaseTestCase
{
    use RefreshDatabase;

    private function asSuperAdmin(): User
    {
        return $this->actingAsRole('super_admin');
    }

    private function asAgencyAdmin(): User
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);

        return $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);
    }

    private function pendingRequest(?Agency $agency = null, ?User $submitter = null): AgencyUpgradeRequest
    {
        $agency ??= Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $submitter ??= User::factory()->create();

        return AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $agency->id,
            'submitted_by' => $submitter->id,
        ]);
    }

    public function test_super_admin_lists_requests_across_agencies(): void
    {
        $this->asSuperAdmin();
        $this->pendingRequest();
        $this->pendingRequest();
        $this->pendingRequest();

        $response = $this->getJson('/api/admin/agency-upgrade-requests');

        $response->assertStatus(200)
            ->assertJsonCount(3, 'data')
            ->assertJsonStructure(['data' => [['id', 'agency_id', 'status']], 'meta']);

        // Distinct agencies → no per-tenant scoping.
        $agencyIds = collect($response->json('data'))->pluck('agency_id')->unique();
        $this->assertCount(3, $agencyIds);
    }

    public function test_super_admin_can_view_request_detail_with_counts(): void
    {
        $this->asSuperAdmin();
        $request = $this->pendingRequest();

        // Add a historical (already-rejected) request on the same agency to
        // exercise the `other_requests` count.
        AgencyUpgradeRequest::factory()->rejected()->create([
            'agency_id' => $request->agency_id,
        ]);

        $response = $this->getJson("/api/admin/agency-upgrade-requests/{$request->id}");

        $response->assertStatus(200)
            ->assertJsonPath('data.id', $request->id)
            ->assertJsonPath('data.agency.id', $request->agency_id)
            ->assertJsonPath('data.counts.other_requests', 1)
            ->assertJsonPath('data.counts.properties', 0);
    }

    public function test_non_super_admin_gets_403_on_listing(): void
    {
        $this->asAgencyAdmin();

        $this->getJson('/api/admin/agency-upgrade-requests')->assertStatus(403);
    }

    public function test_non_super_admin_gets_403_on_detail_and_decisions(): void
    {
        $this->asAgencyAdmin();
        $request = $this->pendingRequest();

        $this->getJson("/api/admin/agency-upgrade-requests/{$request->id}")->assertStatus(403);
        $this->postJson("/api/admin/agency-upgrade-requests/{$request->id}/approve")->assertStatus(403);
        $this->postJson("/api/admin/agency-upgrade-requests/{$request->id}/reject", [
            'comment' => 'Not enough docs provided',
        ])->assertStatus(403);
    }

    public function test_super_admin_approves_pending_request_dispatches_event_and_notifies(): void
    {
        Event::fake([AgencyUpgradeApproved::class]);
        Notification::fake();

        $reviewer = $this->asSuperAdmin();
        $submitter = User::factory()->create();
        $request = $this->pendingRequest(submitter: $submitter);

        $response = $this->postJson("/api/admin/agency-upgrade-requests/{$request->id}/approve", [
            'comment' => 'Looks legit, statuts vérifiés.',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', AgencyUpgradeRequestStatus::Approved->value)
            ->assertJsonPath('data.review_comment', 'Looks legit, statuts vérifiés.');

        $fresh = $request->fresh();
        $this->assertSame(AgencyUpgradeRequestStatus::Approved, $fresh->status);
        $this->assertSame($reviewer->id, (int) $fresh->reviewed_by);
        $this->assertNotNull($fresh->reviewed_at);

        Event::assertDispatched(
            AgencyUpgradeApproved::class,
            fn (AgencyUpgradeApproved $event) => $event->upgradeRequest->id === $request->id,
        );
        Notification::assertSentTo($submitter, AgencyUpgradeApprovedNotification::class);
    }

    public function test_super_admin_rejects_pending_request_with_comment_notifies(): void
    {
        Notification::fake();

        $reviewer = $this->asSuperAdmin();
        $submitter = User::factory()->create();
        $request = $this->pendingRequest(submitter: $submitter);

        $response = $this->postJson("/api/admin/agency-upgrade-requests/{$request->id}/reject", [
            'comment' => 'Documents légaux incomplets — RC manquant.',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', AgencyUpgradeRequestStatus::Rejected->value)
            ->assertJsonPath('data.review_comment', 'Documents légaux incomplets — RC manquant.');

        $fresh = $request->fresh();
        $this->assertSame(AgencyUpgradeRequestStatus::Rejected, $fresh->status);
        $this->assertSame($reviewer->id, (int) $fresh->reviewed_by);

        Notification::assertSentTo($submitter, AgencyUpgradeRejectedNotification::class);
    }

    public function test_super_admin_reject_without_comment_returns_422(): void
    {
        Notification::fake();
        $this->asSuperAdmin();
        $request = $this->pendingRequest();

        $this->postJson("/api/admin/agency-upgrade-requests/{$request->id}/reject", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['comment']);

        $this->assertSame(AgencyUpgradeRequestStatus::Pending, $request->fresh()->status);
        Notification::assertNothingSent();
    }

    public function test_super_admin_reject_with_too_short_comment_returns_422(): void
    {
        Notification::fake();
        $this->asSuperAdmin();
        $request = $this->pendingRequest();

        $this->postJson("/api/admin/agency-upgrade-requests/{$request->id}/reject", [
            'comment' => 'no',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['comment']);
    }

    public function test_approving_already_approved_request_returns_422(): void
    {
        Event::fake([AgencyUpgradeApproved::class]);
        Notification::fake();

        $this->asSuperAdmin();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $request = AgencyUpgradeRequest::factory()->approved()->create([
            'agency_id' => $agency->id,
        ]);

        $this->postJson("/api/admin/agency-upgrade-requests/{$request->id}/approve", [])
            ->assertStatus(422);

        Event::assertNotDispatched(AgencyUpgradeApproved::class);
        Notification::assertNothingSent();
    }

    public function test_rejecting_already_rejected_request_returns_422(): void
    {
        Notification::fake();

        $this->asSuperAdmin();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $request = AgencyUpgradeRequest::factory()->rejected()->create([
            'agency_id' => $agency->id,
        ]);

        $this->postJson("/api/admin/agency-upgrade-requests/{$request->id}/reject", [
            'comment' => 'Trying again — should still 422.',
        ])->assertStatus(422);

        Notification::assertNothingSent();
    }

    public function test_pending_count_endpoint_returns_correct_total(): void
    {
        $this->asSuperAdmin();

        $this->pendingRequest();
        $this->pendingRequest();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        AgencyUpgradeRequest::factory()->approved()->create(['agency_id' => $agency->id]);

        $this->getJson('/api/admin/agency-upgrade-requests/pending-count')
            ->assertStatus(200)
            ->assertJson(['count' => 2]);
    }

    public function test_activity_log_entries_are_recorded_for_decisions(): void
    {
        Notification::fake();
        Event::fake([AgencyUpgradeApproved::class]);

        $this->asSuperAdmin();
        $approved = $this->pendingRequest();
        $rejected = $this->pendingRequest();

        $this->postJson("/api/admin/agency-upgrade-requests/{$approved->id}/approve", [])
            ->assertStatus(200);
        $this->postJson("/api/admin/agency-upgrade-requests/{$rejected->id}/reject", [
            'comment' => 'Motif clair et explicite.',
        ])->assertStatus(200);

        $this->assertNotNull(
            Activity::query()->where('event', 'agency_upgrade_approved')->first(),
            'agency_upgrade_approved activity should be logged',
        );
        $this->assertNotNull(
            Activity::query()->where('event', 'agency_upgrade_rejected')->first(),
            'agency_upgrade_rejected activity should be logged',
        );
    }
}
