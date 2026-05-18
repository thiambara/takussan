<?php

namespace Tests\Unit\Services;

use App\Models\Enums\ReviewStatus;
use App\Models\Review;
use App\Models\User;
use App\Services\Review\ReviewModerationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReviewModerationServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_approves_a_pending_review(): void
    {
        $actor = User::factory()->create();
        $review = Review::factory()->create([
            'status' => ReviewStatus::Pending,
            'is_approved' => false,
        ]);

        $moderated = app(ReviewModerationService::class)->approve($review, $actor);

        $this->assertSame(ReviewStatus::Approved, $moderated->status);
        $this->assertTrue($moderated->is_approved);
        $this->assertSame($actor->id, $moderated->approved_by_id);
    }

    public function test_it_rejects_with_metadata_reason(): void
    {
        $actor = User::factory()->create();
        $review = Review::factory()->create([
            'status' => ReviewStatus::Reported,
            'is_approved' => false,
        ]);

        $moderated = app(ReviewModerationService::class)->reject($review, $actor, 'Contenu abusif.');

        $this->assertSame(ReviewStatus::Rejected, $moderated->status);
        $this->assertFalse($moderated->is_approved);
        $this->assertSame('Contenu abusif.', $moderated->metadata['moderation_reason']);
        $this->assertSame($actor->id, $moderated->metadata['moderated_by_id']);
    }

    public function test_it_soft_deletes_on_remove(): void
    {
        $actor = User::factory()->create();
        $review = Review::factory()->create(['status' => ReviewStatus::Reported]);

        $result = app(ReviewModerationService::class)->moderate($review, $actor, 'remove', 'Spam.');

        $this->assertTrue($result['deleted']);
        $this->assertSoftDeleted('reviews', ['id' => $review->id]);
    }
}
