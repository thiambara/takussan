<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\ReviewStatus;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class ReviewModerationWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        Role::findOrCreate('super_admin', 'web');
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        $admin->assignRole('super_admin');

        return $admin;
    }

    public function test_pending_review_can_transition_to_approved(): void
    {
        $review = Review::factory()->create([
            'status' => ReviewStatus::Pending,
            'is_approved' => false,
        ]);

        Sanctum::actingAs($this->admin());

        $this->postJson("/api/reviews/{$review->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', ReviewStatus::Approved->value)
            ->assertJsonPath('data.is_approved', true);
    }

    public function test_pending_review_can_transition_to_rejected(): void
    {
        $review = Review::factory()->create([
            'status' => ReviewStatus::Pending,
            'is_approved' => false,
        ]);

        Sanctum::actingAs($this->admin());

        $this->postJson("/api/reviews/{$review->id}/reject")
            ->assertOk()
            ->assertJsonPath('data.status', ReviewStatus::Rejected->value)
            ->assertJsonPath('data.is_approved', false);
    }

    public function test_rejected_review_cannot_transition_further(): void
    {
        $review = Review::factory()->create([
            'status' => ReviewStatus::Rejected,
            'is_approved' => false,
        ]);

        Sanctum::actingAs($this->admin());

        $this->postJson("/api/reviews/{$review->id}/approve")
            ->assertStatus(422);
    }

    public function test_approved_review_can_be_rejected(): void
    {
        $review = Review::factory()->create([
            'status' => ReviewStatus::Approved,
            'is_approved' => true,
        ]);

        Sanctum::actingAs($this->admin());

        $this->postJson("/api/reviews/{$review->id}/reject")
            ->assertOk()
            ->assertJsonPath('data.status', ReviewStatus::Rejected->value);
    }

    public function test_reported_review_can_be_approved_or_rejected(): void
    {
        $review = Review::factory()->create([
            'status' => ReviewStatus::Reported,
            'is_approved' => false,
        ]);

        Sanctum::actingAs($this->admin());

        $this->postJson("/api/reviews/{$review->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', ReviewStatus::Approved->value);
    }

    public function test_report_transitions_pending_to_reported_when_threshold_reached(): void
    {
        config()->set('takussan.reviews.report_threshold', 1);

        $review = Review::factory()->create([
            'status' => ReviewStatus::Pending,
            'is_approved' => false,
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/reviews/{$review->id}/report", [
            'reason' => 'spam',
        ])->assertOk();

        $review->refresh();
        $this->assertSame(ReviewStatus::Reported, $review->status);
        $this->assertSame(1, (int) $review->reported_count);
    }

    public function test_report_is_deduped_per_user(): void
    {
        // With threshold=2, a single user hitting the endpoint twice must
        // not count as two distinct reports — otherwise one actor could
        // trip the auto-report transition alone.
        config()->set('takussan.reviews.report_threshold', 2);

        $review = Review::factory()->create([
            'status' => ReviewStatus::Pending,
            'is_approved' => false,
        ]);

        $reporter = User::factory()->create();
        Sanctum::actingAs($reporter);

        $this->postJson("/api/reviews/{$review->id}/report", ['reason' => 'spam'])->assertOk();
        $this->postJson("/api/reviews/{$review->id}/report", ['reason' => 'spam again'])->assertOk();

        $review->refresh();
        $this->assertSame(1, (int) $review->reported_count);
        $this->assertSame(ReviewStatus::Pending, $review->status);

        // A different reporter trips the threshold.
        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/reviews/{$review->id}/report", ['reason' => 'spam'])->assertOk();

        $review->refresh();
        $this->assertSame(2, (int) $review->reported_count);
        $this->assertSame(ReviewStatus::Reported, $review->status);
    }

    public function test_report_does_not_transition_rejected_review(): void
    {
        config()->set('takussan.reviews.report_threshold', 1);

        $review = Review::factory()->create([
            'status' => ReviewStatus::Rejected,
            'is_approved' => false,
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/reviews/{$review->id}/report", [
            'reason' => 'stale',
        ])->assertOk();

        $review->refresh();
        $this->assertSame(ReviewStatus::Rejected, $review->status);
    }

    public function test_non_admin_cannot_reject_review(): void
    {
        $review = Review::factory()->create(['status' => ReviewStatus::Pending]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/reviews/{$review->id}/reject")->assertForbidden();
    }

    public function test_cannot_reply_to_rejected_review(): void
    {
        // Rejected is a terminal moderation state — it's invisible to the
        // public, so letting admin/owner still reply to it is nonsensical
        // and lets through noise into the audit trail.
        $review = Review::factory()->create([
            'status' => ReviewStatus::Rejected,
            'is_approved' => false,
        ]);

        Sanctum::actingAs($this->admin());

        $this->postJson("/api/reviews/{$review->id}/reply", [
            'reply_content' => 'too late',
        ])->assertStatus(422);
    }

    public function test_enum_transition_map(): void
    {
        $this->assertTrue(ReviewStatus::Pending->canTransitionTo(ReviewStatus::Approved));
        $this->assertTrue(ReviewStatus::Pending->canTransitionTo(ReviewStatus::Rejected));
        $this->assertTrue(ReviewStatus::Pending->canTransitionTo(ReviewStatus::Reported));
        $this->assertTrue(ReviewStatus::Reported->canTransitionTo(ReviewStatus::Approved));
        $this->assertTrue(ReviewStatus::Reported->canTransitionTo(ReviewStatus::Rejected));
        $this->assertTrue(ReviewStatus::Approved->canTransitionTo(ReviewStatus::Reported));
        $this->assertTrue(ReviewStatus::Approved->canTransitionTo(ReviewStatus::Rejected));
        $this->assertFalse(ReviewStatus::Rejected->canTransitionTo(ReviewStatus::Approved));
        $this->assertFalse(ReviewStatus::Rejected->canTransitionTo(ReviewStatus::Reported));
    }
}
