<?php

namespace App\Observers;

use App\Models\Enums\ReviewStatus;
use App\Models\Review;
use App\Services\Review\ReviewNotifier;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

class ReviewObserver
{
    public function __construct(private readonly ReviewNotifier $notifier) {}

    public function created(Review $review): void
    {
        $this->syncCounts($review);
    }

    /**
     * TCK-597 (ADR-0043 §6, AC12) — le recompte suit chaque changement de publication. Avant, il
     * ne se faisait qu'à la création et à la suppression : approuver ou rejeter un avis laissait la
     * moyenne stockée en l'état.
     */
    public function updated(Review $review): void
    {
        if ($review->wasChanged(['is_approved', 'status'])) {
            $this->syncCounts($review);
        }

        if ($review->wasChanged('status') && $review->status === ReviewStatus::Approved) {
            $this->notifier->received($review);
        }
    }

    public function deleted(Review $review): void
    {
        $this->syncCounts($review);
    }

    /**
     * TCK-597 — les agrégats stockés ne comptent que les avis PUBLIÉS (`is_approved = true`), le
     * critère des lectures publiques : un avis en attente ne fait plus monter la moyenne, et un
     * signalement (qui ne touche pas `is_approved`) ne la fait pas bouger.
     */
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
            ->where('is_approved', true)
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
