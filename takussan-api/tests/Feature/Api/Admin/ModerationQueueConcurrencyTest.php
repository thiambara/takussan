<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\ReviewStatus;
use App\Models\ModerationClaim;
use App\Models\Property;
use App\Models\PropertyReport;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-597 (ADR-0043 §7, AC11) — aucune décision de la file ne se joue deux fois, et un élément
 * pris en charge par un modérateur ne se tranche pas sous ses yeux.
 *
 * Avant : `decide` ne verrouillait rien et ne vérifiait pas que l'élément était encore ouvert ; un
 * signalement déjà résolu se tranchait une seconde fois.
 */
class ModerationQueueConcurrencyTest extends ApiTestCase
{
    use RefreshDatabase;

    private User $first;

    private User $second;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->first = User::factory()->create();
        $this->materializeRoleProfile($this->first, 'super_admin');
        $this->second = User::factory()->create();
        $this->materializeRoleProfile($this->second, 'super_admin');
    }

    private function decide(User $actor, string $id, array $body): TestResponse
    {
        $this->actingAsApi($actor);

        return $this->postJson("/api/admin/moderation/{$id}/decide", $body);
    }

    public function test_a_second_decision_on_the_same_item_is_409_and_changes_nothing(): void
    {
        $property = Property::factory()->published()->create(['agency_id' => Agency::factory()->create()->id]);
        $report = PropertyReport::create(['property_id' => $property->id, 'reason' => 'fraud']);

        $this->decide($this->first, "property_report:{$report->id}", ['decision' => 'reject', 'reason_code' => 'off_topic'])
            ->assertOk();
        $this->decide($this->second, "property_report:{$report->id}", ['decision' => 'hide', 'reason_code' => 'fraud'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'moderation.already_decided');

        $report->refresh();
        $this->assertSame('reject', $report->decision);
        $this->assertSame($this->first->id, $report->resolved_by_id);
        $this->assertNull($property->refresh()->platform_hold_at);
        $this->assertSame(PropertyStatus::Available, $property->status);
    }

    public function test_a_decided_review_and_a_decided_property_are_409_too(): void
    {
        $review = Review::factory()->create(['status' => ReviewStatus::Pending, 'is_approved' => false]);
        $pending = Property::factory()->create(['status' => PropertyStatus::PendingReview, 'submitted_at' => now()]);

        $this->decide($this->first, "review:{$review->id}", ['decision' => 'remove', 'reason_code' => 'spam'])->assertOk();
        $this->decide($this->second, "review:{$review->id}", ['decision' => 'approve'])->assertStatus(409);
        $this->assertSoftDeleted($review);

        $this->decide($this->first, "property:{$pending->id}", ['decision' => 'approve'])->assertOk();
        $this->decide($this->second, "property:{$pending->id}", ['decision' => 'reject', 'reason_code' => 'misleading'])
            ->assertStatus(409);
        $this->assertSame(PropertyStatus::Available, $pending->refresh()->status);
    }

    public function test_an_item_claimed_by_a_is_409_for_b_until_the_claim_expires(): void
    {
        $review = Review::factory()->create(['status' => ReviewStatus::Reported, 'is_approved' => true]);
        $id = "review:{$review->id}";

        $this->actingAsApi($this->first);
        $this->postJson("/api/admin/moderation/{$id}/claim")
            ->assertOk()
            ->assertJsonPath('data.by.id', $this->first->id);

        $this->actingAsApi($this->second);
        $this->postJson("/api/admin/moderation/{$id}/claim")->assertStatus(409)->assertJsonPath('code', 'moderation.claimed_by_other');
        $this->deleteJson("/api/admin/moderation/{$id}/claim")->assertStatus(409)->assertJsonPath('code', 'moderation.claim_not_held');
        $this->decide($this->second, $id, ['decision' => 'hide', 'reason_code' => 'offensive'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'moderation.claimed_by_other');
        $this->assertSame(ReviewStatus::Reported, $review->refresh()->status);

        // La file dit qui tient l'élément.
        $this->getJson('/api/admin/moderation')
            ->assertOk()
            ->assertJsonPath('data.0.claim.by.id', $this->first->id)
            ->assertJsonPath('data.0.claim.by.name', $this->first->full_name ?: $this->first->email);

        $this->travel(ModerationClaim::DURATION_MINUTES + 1)->minutes();

        $this->decide($this->second, $id, ['decision' => 'hide', 'reason_code' => 'offensive'])->assertOk();
        $this->assertSame(ReviewStatus::Rejected, $review->refresh()->status);
        $this->assertSame(0, ModerationClaim::query()->count(), 'la prise est rendue avec la décision');
    }

    public function test_the_holder_decides_and_can_release(): void
    {
        $review = Review::factory()->create(['status' => ReviewStatus::Pending, 'is_approved' => false]);
        $id = "review:{$review->id}";

        $this->actingAsApi($this->first);
        $this->postJson("/api/admin/moderation/{$id}/claim")->assertOk();
        $this->deleteJson("/api/admin/moderation/{$id}/claim")->assertNoContent();

        $this->actingAsApi($this->second);
        $this->postJson("/api/admin/moderation/{$id}/claim")->assertOk();
        $this->decide($this->second, $id, ['decision' => 'approve'])->assertOk();
        $this->assertSame(ReviewStatus::Approved, $review->refresh()->status);
    }

    public function test_other_without_a_reason_is_422(): void
    {
        $review = Review::factory()->create(['status' => ReviewStatus::Pending, 'is_approved' => false]);

        $this->decide($this->first, "review:{$review->id}", ['decision' => 'hide', 'reason_code' => 'other'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reason');
        $this->decide($this->first, "review:{$review->id}", ['decision' => 'hide', 'reason_code' => 'pas-un-code'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reason_code');
        $this->assertSame(ReviewStatus::Pending, $review->refresh()->status);
    }
}
