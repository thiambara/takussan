<?php

namespace App\Observers;

use App\Models\Review;

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

        $stats = $reviewable->reviews()->selectRaw('COUNT(*) as count, AVG(rating) as avg')->first();

        $reviewable->update([
            'reviews_count' => (int) ($stats->count ?? 0),
            'average_rating' => $stats->avg ? round((float) $stats->avg, 2) : null,
        ]);
    }
}
