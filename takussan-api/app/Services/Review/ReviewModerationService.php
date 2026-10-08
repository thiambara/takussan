<?php

namespace App\Services\Review;

use App\Models\Enums\ReviewStatus;
use App\Models\Review;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ReviewModerationService
{
    /** Le code du motif de la décision en cours, recopié dans `metadata` (ADR-0043 §7). */
    private ?string $reasonCode = null;

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

        if (($reason !== null && $reason !== '') || $this->reasonCode !== null) {
            $attributes['metadata'] = $this->moderationMetadata($review, $actor, $reason);
        }

        $review->update($attributes);

        return $review->refresh();
    }

    /**
     * TCK-597 — la décision se prend SOUS VERROU de la ligne, relue fraîche : deux modérateurs qui
     * tranchent le même avis en même temps ne lisent plus tous deux « en attente ». Le second
     * trouve l'état terminal et reçoit le 422 de transition.
     *
     * @return array{review: Review, deleted: bool}
     */
    public function moderate(Review $review, User $actor, string $decision, ?string $reason = null, ?string $reasonCode = null): array
    {
        return DB::transaction(function () use ($review, $actor, $decision, $reason, $reasonCode): array {
            $locked = Review::query()->whereKey($review->getKey())->lockForUpdate()->firstOrFail();
            $this->reasonCode = $reasonCode;

            try {
                return match ($decision) {
                    'approve' => ['review' => $this->approve($locked, $actor), 'deleted' => false],
                    'reject', 'hide' => ['review' => $this->reject($locked, $actor, $reason), 'deleted' => false],
                    'delete', 'remove' => $this->remove($locked, $actor, $reason),
                    'ignore' => ['review' => $this->ignore($locked, $actor, $reason), 'deleted' => false],
                    default => abort_code(422, 'review.moderation_decision_invalid'),
                };
            } finally {
                $this->reasonCode = null;
            }
        });
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
        $metadata['ignored_reason_code'] = $this->reasonCode;

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
        $metadata['moderation_reason_code'] = $this->reasonCode;
        $metadata['moderated_by_id'] = $actor->id;
        $metadata['moderated_at'] = now()->toISOString();

        return $metadata;
    }

    private function assertTransition(Review $review, ReviewStatus $target): void
    {
        $current = $review->status ?? ReviewStatus::Pending;
        abort_code_unless(
            $current->canTransitionTo($target),
            422,
            'review.status_transition_invalid',
            ['from' => $current->value, 'to' => $target->value]
        );
    }
}
