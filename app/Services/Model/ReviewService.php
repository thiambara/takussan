<?php

namespace App\Services\Model;

use App\Models\Review;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Throwable;

class ReviewService
{
    /**
     * Store a new review
     * @throws Throwable
     */
    public function store(array $data): Review
    {
        // Set current user if not provided
        if (!isset($data['user_id'])) {
            $data['user_id'] = Auth::id();
        }

        // Check if the user has permission to auto-approve reviews
        $canAutoApprove = Auth::user() && Auth::user()->hasPermissionTo('reviews.approve');

        if ($canAutoApprove && (!isset($data['is_approved']) || $data['is_approved'])) {
            $data['is_approved'] = true;
            $data['approved_by'] = Auth::id();
            $data['approved_at'] = now();
        } else {
            $data['is_approved'] = false;
            $data['approved_by'] = null;
            $data['approved_at'] = null;
        }

        return DB::transaction(function () use ($data) {
            return Review::create($data);
        });
    }

    /**
     * Delete a review
     * @throws Throwable
     */
    public function delete(Review $review): bool
    {
        return DB::transaction(function () use ($review) {
            return $review->delete();
        });
    }

    /**
     * Approve a review
     * @throws Throwable
     */
    public function approve(Review $review): Review
    {
        return $this->update($review, [
            'is_approved' => true,
        ]);
    }

    /**
     * Update an existing review
     * @throws Throwable
     */
    public function update(Review $review, array $data): Review
    {
        // Handle approval state changes
        if (isset($data['is_approved']) && $data['is_approved'] && !$review->is_approved) {
            // Review is being approved
            $data['approved_by'] = Auth::id();
            $data['approved_at'] = now();
        } elseif (isset($data['is_approved']) && !$data['is_approved'] && $review->is_approved) {
            // Review is being unapproved
            $data['approved_by'] = null;
            $data['approved_at'] = null;
        }

        return DB::transaction(function () use ($review, $data) {
            $review->update($data);
            return $review;
        });
    }

    /**
     * Reject a review
     * @throws Throwable
     */
    public function reject(Review $review): Review
    {
        return $this->update($review, [
            'is_approved' => false,
        ]);
    }

    /**
     * Report a review
     * @throws Throwable
     */
    public function report(Review $review): Review
    {
        return DB::transaction(function () use ($review) {
            $review->increment('reported_count');

            // If reported count exceeds threshold, unapprove review
            if ($review->reported_count >= 5 && $review->is_approved) {
                $review->update([
                    'is_approved' => false,
                ]);
            }

            return $review;
        });
    }

    /**
     * Get reviews for a model
     */
    public function getReviewsForModel(string $modelType, int $modelId, bool $approvedOnly = true): Collection
    {
        $query = Review::where('model_type', $modelType)
            ->where('model_id', $modelId);

        if ($approvedOnly) {
            $query->where('is_approved', true);
        }

        return $query->with('user')
            ->orderBy('created_at', 'desc')
            ->get();
    }
}
