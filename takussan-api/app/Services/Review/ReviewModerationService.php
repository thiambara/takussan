<?php

namespace App\Services\Review;

use App\Models\Enums\ReviewStatus;
use App\Models\Review;
use App\Models\User;

class ReviewModerationService
{
    public function approve(Review $review, User $actor): Review
    {
        $this->assertTransition($review, ReviewStatus::Approved);

        $review->update([
            'status' => ReviewStatus::Approved,
            'is_approved' => true,
            'approved_at' => now(),
            'approved_by_id' => $actor->id,
        ]);

        return $review->refresh();
    }

    public function reject(Review $review, User $actor, ?string $reason = null): Review
    {
        $this->assertTransition($review, ReviewStatus::Rejected);

        $attributes = [
            'status' => ReviewStatus::Rejected,
            'is_approved' => false,
        ];

        if ($reason !== null && $reason !== '') {
            $attributes['metadata'] = $this->moderationMetadata($review, $actor, $reason);
        }

        $review->update($attributes);

        return $review->refresh();
    }

    /**
     * @return array{review: Review, deleted: bool}
     */
    public function moderate(Review $review, User $actor, string $decision, ?string $reason = null): array
    {
        return match ($decision) {
            'approve' => ['review' => $this->approve($review, $actor), 'deleted' => false],
            'reject', 'hide' => ['review' => $this->reject($review, $actor, $reason), 'deleted' => false],
            'delete', 'remove' => $this->remove($review, $actor, $reason),
            'ignore' => ['review' => $this->ignore($review, $actor, $reason), 'deleted' => false],
            default => abort(422, 'Unsupported review moderation decision.'),
        };
    }

    /**
     * @return array{review: Review, deleted: true}
     */
    private function remove(Review $review, User $actor, ?string $reason): array
    {
        $this->assertTransition($review, ReviewStatus::Rejected);

        $review->update([
            'status' => ReviewStatus::Rejected,
            'is_approved' => false,
            'metadata' => $this->moderationMetadata($review, $actor, $reason),
        ]);
        $review->delete();

        return ['review' => $review, 'deleted' => true];
    }

    private function ignore(Review $review, User $actor, ?string $reason): Review
    {
        $metadata = $review->metadata ?? [];
        $metadata['ignored_reports_by_id'] = $actor->id;
        $metadata['ignored_reports_at'] = now()->toISOString();
        $metadata['ignored_reason'] = $reason;

        $review->update(['metadata' => $metadata]);

        return $review->refresh();
    }

    /**
     * @return array<string,mixed>
     */
    private function moderationMetadata(Review $review, User $actor, ?string $reason): array
    {
        $metadata = $review->metadata ?? [];
        $metadata['moderation_reason'] = $reason;
        $metadata['moderated_by_id'] = $actor->id;
        $metadata['moderated_at'] = now()->toISOString();

        return $metadata;
    }

    private function assertTransition(Review $review, ReviewStatus $target): void
    {
        $current = $review->status ?? ReviewStatus::Pending;
        abort_unless(
            $current->canTransitionTo($target),
            422,
            "Cannot transition review from {$current->value} to {$target->value}."
        );
    }
}
