<?php

namespace App\Observers;

use App\Models\Review;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

class ReviewObserver
{
    public function created(Review $review): void
    {
        $this->syncCounts($review);
    }

    public function deleted(Review $review): void
    {
        $this->syncCounts($review);
    }

    private function syncCounts(Review $review): void
    {
        $reviewable = $review->reviewable;
        if ($reviewable === null) {
            return;
        }

        $relation = $this->resolveReviewsRelation($reviewable);
        if ($relation === null) {
            return;
        }

        $stats = $reviewable->{$relation}()
            ->selectRaw('COUNT(*) as count, AVG(rating) as avg')
            ->first();

        $payload = [];
        $table = $reviewable->getTable();

        if (Schema::hasColumn($table, 'reviews_count')) {
            $payload['reviews_count'] = (int) ($stats->count ?? 0);
        }
        if (Schema::hasColumn($table, 'average_rating')) {
            $payload['average_rating'] = $stats->avg ? round((float) $stats->avg, 2) : null;
        }

        if ($payload !== []) {
            $reviewable->forceFill($payload)->save();
        }
    }

    private function resolveReviewsRelation(Model $reviewable): ?string
    {
        foreach (['reviews', 'received_reviews'] as $candidate) {
            if (method_exists($reviewable, $candidate)) {
                return $candidate;
            }
        }

        return null;
    }
}
