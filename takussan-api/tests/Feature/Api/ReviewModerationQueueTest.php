<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\ReviewStatus;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReviewModerationQueueTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->withTwoFactor()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($admin, 'super_admin');

        return $admin;
    }

    private function superAdmin(): User
    {
        $user = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($user, 'super_admin');

        return $user;
    }

    public function test_admin_can_list_reviews_for_moderation(): void
    {
        // Create reviews first — Review factories spawn new Agency contexts
        // which shift the spatie permission team registrar. We then create
        // the admin so its role assignment sticks under the correct team.
        Review::factory()->count(3)->create(['status' => ReviewStatus::Pending]);
        Review::factory()->count(2)->create(['status' => ReviewStatus::Approved]);

        $admin = $this->admin();
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/reviews')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta' => ['total', 'pending_count']]);

        $this->assertSame(5, $response->json('meta.total'));
    }

    public function test_filter_by_moderation_status(): void
    {
        Review::factory()->create(['status' => ReviewStatus::Pending]);
        Review::factory()->create(['status' => ReviewStatus::Approved]);
        Review::factory()->create(['status' => ReviewStatus::Reported]);

        Sanctum::actingAs($this->admin());

        $response = $this->getJson('/api/reviews?filter[moderation_status]=flagged')
            ->assertOk();
        $this->assertSame(1, $response->json('meta.total'));

        $response = $this->getJson('/api/reviews?filter[moderation_status]=pending')
            ->assertOk();
        $this->assertSame(1, $response->json('meta.total'));
    }

    public function test_meta_pending_count_reflects_queue(): void
    {
        Review::factory()->create(['status' => ReviewStatus::Pending]);
        Review::factory()->create(['status' => ReviewStatus::Reported]);
        Review::factory()->create(['status' => ReviewStatus::Approved]);

        Sanctum::actingAs($this->admin());

        $response = $this->getJson('/api/reviews')->assertOk();
        $this->assertSame(2, $response->json('meta.pending_count'));
    }

    public function test_moderate_approve_transitions_to_approved(): void
    {
        $review = Review::factory()->create([
            'status' => ReviewStatus::Pending,
            'is_approved' => false,
        ]);

        Sanctum::actingAs($this->admin());

        $this->patchJson("/api/reviews/{$review->id}/moderate", [
            'decision' => 'approve',
        ])->assertOk()
            ->assertJsonPath('data.status', ReviewStatus::Approved->value)
            ->assertJsonPath('data.is_approved', true);
    }

    public function test_moderate_hide_requires_reason(): void
    {
        $review = Review::factory()->create(['status' => ReviewStatus::Pending]);

        Sanctum::actingAs($this->admin());

        // Missing reason
        $this->patchJson("/api/reviews/{$review->id}/moderate", [
            'decision' => 'hide',
        ])->assertStatus(422);

        // TCK-597 (ADR-0043 §7) — le motif est un code ; le texte libre n'est exigé que pour `other`.
        $this->patchJson("/api/reviews/{$review->id}/moderate", [
            'decision' => 'hide',
            'reason_code' => 'other',
        ])->assertStatus(422)->assertJsonValidationErrors(['reason']);

        $this->patchJson("/api/reviews/{$review->id}/moderate", [
            'decision' => 'hide',
            'reason_code' => 'offensive',
        ])->assertOk()
            ->assertJsonPath('data.status', ReviewStatus::Rejected->value);
    }

    public function test_moderate_delete_soft_deletes_review(): void
    {
        $review = Review::factory()->create(['status' => ReviewStatus::Reported]);

        Sanctum::actingAs($this->admin());

        $this->patchJson("/api/reviews/{$review->id}/moderate", [
            'decision' => 'delete',
            'reason_code' => 'spam',
        ])->assertOk()
            ->assertJsonPath('data.deleted', true);

        $this->assertSoftDeleted('reviews', ['id' => $review->id]);
    }

    public function test_reports_endpoint_returns_report_list(): void
    {
        $reporter = User::factory()->create(['first_name' => 'Ada', 'last_name' => 'Lovelace']);
        $review = Review::factory()->create([
            'status' => ReviewStatus::Reported,
            'reported_count' => 1,
            'metadata' => [
                'reports' => [
                    [
                        'user_id' => $reporter->id,
                        'reason' => 'spam',
                        'reported_at' => now()->toISOString(),
                    ],
                ],
            ],
        ]);

        Sanctum::actingAs($this->admin());

        $this->getJson("/api/reviews/{$review->id}/reports")
            ->assertOk()
            ->assertJsonPath('data.0.reason', 'spam')
            ->assertJsonPath('data.0.user.id', $reporter->id)
            ->assertJsonPath('meta.total', 1);
    }

    public function test_non_admin_cannot_moderate(): void
    {
        $review = Review::factory()->create(['status' => ReviewStatus::Pending]);

        Sanctum::actingAs(User::factory()->create());

        $this->patchJson("/api/reviews/{$review->id}/moderate", [
            'decision' => 'approve',
        ])->assertForbidden();
    }

    /** TCK-1407 (P151.06) — une liste (`filter[moderation_status][]=`) est ignorée comme un statut inconnu. */
    public function test_a_list_moderation_status_is_ignored(): void
    {
        Review::factory()->create(['status' => ReviewStatus::Pending]);
        Review::factory()->create(['status' => ReviewStatus::Approved]);

        Sanctum::actingAs($this->admin());

        $this->assertSame(2, $this->getJson('/api/reviews?filter[moderation_status][]=pending')->assertOk()->json('meta.total'));
    }

    // --- Décisions unitaires et signalements (TCK-3017 : ex-ReviewModerationWorkflowTest et
    // ex-ReviewReportAndDocSearchTest, un fichier par module — ADR-0140) ---

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

    /** verif-597 m3 — seul un avis PUBLIÉ se signale : c'est lui qui passe `reported`. */
    public function test_report_transitions_approved_to_reported_when_threshold_reached(): void
    {
        $review = Review::factory()->create([
            'status' => ReviewStatus::Approved,
            'is_approved' => true,
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
        // TCK-597 — le seuil est la constante `ReviewReportService::REPORTED_THRESHOLD` (1) : un
        // signalement range l'avis dans la file sans le masquer. Le dédoublonnage reste par compte.
        $review = Review::factory()->create([
            'status' => ReviewStatus::Approved,
            'is_approved' => true,
        ]);

        $reporter = User::factory()->create();
        Sanctum::actingAs($reporter);

        $this->postJson("/api/reviews/{$review->id}/report", ['reason' => 'spam'])->assertOk();
        $this->postJson("/api/reviews/{$review->id}/report", ['reason' => 'spam again'])->assertOk();

        $review->refresh();
        $this->assertSame(1, (int) $review->reported_count);
        $this->assertSame(ReviewStatus::Reported, $review->status);

        // Un autre compte compte.
        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/reviews/{$review->id}/report", ['reason' => 'spam'])->assertOk();

        $this->assertSame(2, (int) $review->refresh()->reported_count);
        // TCK-3017 — ex-ReviewReportAndDocSearchTest::multiple_reports_accumulate : chaque compte
        // ajoute SA ligne à `metadata.reports`, que la file des signalements relit.
        $this->assertCount(2, $review->metadata['reports']);
    }

    /** verif-597 m3 — un avis masqué n'est plus publié : il ne se signale pas (404). */
    public function test_report_does_not_transition_rejected_review(): void
    {
        $review = Review::factory()->create([
            'status' => ReviewStatus::Rejected,
            'is_approved' => false,
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/reviews/{$review->id}/report", [
            'reason' => 'stale',
        ])->assertNotFound();

        $review->refresh();
        $this->assertSame(ReviewStatus::Rejected, $review->status);
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

    public function test_user_can_report_review(): void
    {
        $user = User::factory()->create();
        $review = Review::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson("/api/reviews/{$review->id}/report", [
            'reason' => 'Contenu inapproprié',
        ])->assertOk();

        $review->refresh();
        $this->assertTrue($review->metadata['reported']);
        $this->assertCount(1, $review->metadata['reports']);
        $this->assertEquals($user->id, $review->metadata['reports'][0]['user_id']);
    }

    public function test_report_requires_reason(): void
    {
        $user = User::factory()->create();
        $review = Review::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson("/api/reviews/{$review->id}/report", [])
            ->assertStatus(422);
    }
}
