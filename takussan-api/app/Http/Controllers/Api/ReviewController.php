<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\ReviewResource;
use App\Models\Agency;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\Review;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReviewController extends Controller
{
    public function indexForProperty(Request $request, Property $property): JsonResponse
    {
        $reviews = $property->reviews()
            ->where('is_approved', true)
            ->latest()
            ->paginate((int) $request->input('per_page', 10));

        return $this->json([
            'data' => ReviewResource::collection($reviews)->toArray($request),
            'meta' => ['total' => $reviews->total(), 'current_page' => $reviews->currentPage()],
        ]);
    }

    public function storeForProperty(Request $request, Property $property): JsonResponse
    {
        $user = $request->user();

        $hasCompletedBooking = $property->bookings()
            ->whereIn('status', [BookingStatus::Completed, BookingStatus::Confirmed])
            ->whereHas('customer', fn ($q) => $q->where('user_id', $user->id))
            ->exists();
        $hasLease = $property->leases()
            ->whereIn('status', [LeaseStatus::Active, LeaseStatus::Terminated, LeaseStatus::Expired])
            ->whereHas('tenant', fn ($q) => $q->where('user_id', $user->id))
            ->exists();
        abort_unless(
            $hasCompletedBooking || $hasLease || $user->hasRole(['admin', 'super_admin']),
            403,
            'Only customers with a completed booking or lease can review this property.'
        );

        $alreadyReviewed = $property->reviews()->where('author_id', $user->id)->exists();
        abort_if($alreadyReviewed, 422, 'You have already reviewed this property.');

        $data = $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'title' => ['nullable', 'string'],
            'content' => ['nullable', 'string'],
        ]);

        $review = $property->reviews()->create(array_merge($data, [
            'author_id' => $user->id,
            'is_approved' => false,
            'status' => ReviewStatus::Pending,
        ]));

        return $this->json(['data' => ReviewResource::make($review)->toArray($request)], 201);
    }

    public function reply(Request $request, Review $review): JsonResponse
    {
        $user = $request->user();
        $reviewable = $review->reviewable;
        $ok = $user->hasRole(['admin', 'super_admin'])
            || ($reviewable && isset($reviewable->user_id) && $reviewable->user_id === $user->id)
            || ($user->agency_id && isset($reviewable->agency_id) && $reviewable->agency_id === $user->agency_id);
        abort_unless($ok, 403);

        $data = $request->validate([
            'reply_content' => ['required', 'string'],
        ]);

        $review->update([
            'reply_content' => $data['reply_content'],
            'replied_by_id' => $user->id,
            'replied_at' => now(),
        ]);

        return $this->json(['data' => ReviewResource::make($review->refresh())->toArray($request)]);
    }

    public function approve(Request $request, Review $review): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        $this->assertTransition($review, ReviewStatus::Approved);

        $review->update([
            'status' => ReviewStatus::Approved,
            'is_approved' => true,
            'approved_at' => now(),
            'approved_by_id' => $request->user()->id,
        ]);

        return $this->json(['data' => ReviewResource::make($review->refresh())->toArray($request)]);
    }

    public function reject(Request $request, Review $review): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        $this->assertTransition($review, ReviewStatus::Rejected);

        $review->update([
            'status' => ReviewStatus::Rejected,
            'is_approved' => false,
        ]);

        return $this->json(['data' => ReviewResource::make($review->refresh())->toArray($request)]);
    }

    public function indexForAgency(Request $request, Agency $agency): JsonResponse
    {
        $reviews = $agency->reviews()
            ->where('is_approved', true)
            ->latest()
            ->paginate((int) $request->input('per_page', 10));

        return $this->json([
            'data' => ReviewResource::collection($reviews)->toArray($request),
            'meta' => ['total' => $reviews->total(), 'current_page' => $reviews->currentPage()],
        ]);
    }

    public function storeForAgency(Request $request, Agency $agency): JsonResponse
    {
        $user = $request->user();

        $hasInteraction = $agency->leases()
            ->whereHas('tenant', fn ($q) => $q->where('user_id', $user->id))
            ->exists();
        abort_unless(
            $hasInteraction || $user->hasRole(['admin', 'super_admin']),
            403,
            'Only customers with a completed transaction can review this agency.'
        );

        $alreadyReviewed = $agency->reviews()->where('author_id', $user->id)->exists();
        abort_if($alreadyReviewed, 422, 'You have already reviewed this agency.');

        $data = $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'title' => ['nullable', 'string'],
            'content' => ['nullable', 'string'],
        ]);

        $review = $agency->reviews()->create(array_merge($data, [
            'author_id' => $user->id,
            'is_approved' => false,
            'status' => ReviewStatus::Pending,
        ]));

        return $this->json(['data' => ReviewResource::make($review)->toArray($request)], 201);
    }

    public function report(Request $request, Review $review): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $metadata = $review->metadata ?? [];
        $reports = $metadata['reports'] ?? [];
        $reports[] = [
            'user_id' => $request->user()->id,
            'reason' => $data['reason'],
            'reported_at' => now()->toISOString(),
        ];
        $metadata['reports'] = $reports;
        $metadata['reported'] = true;

        $attrs = [
            'metadata' => $metadata,
            'reported_count' => ($review->reported_count ?? 0) + 1,
        ];

        // Automatically transition to `reported` once the threshold is
        // reached so admins see the review in their moderation queue.
        $threshold = (int) config('takussan.reviews.report_threshold', 1);
        $currentStatus = $review->status ?? ReviewStatus::Pending;
        if (
            $attrs['reported_count'] >= $threshold
            && $currentStatus !== ReviewStatus::Rejected
            && $currentStatus->canTransitionTo(ReviewStatus::Reported)
        ) {
            $attrs['status'] = ReviewStatus::Reported;
        }

        $review->update($attrs);

        return $this->json(['message' => __('messages.review_reported')]);
    }

    /**
     * Ensure the requested status transition is allowed, else 422.
     */
    protected function assertTransition(Review $review, ReviewStatus $target): void
    {
        $current = $review->status ?? ReviewStatus::Pending;
        abort_unless(
            $current->canTransitionTo($target),
            422,
            "Cannot transition review from {$current->value} to {$target->value}."
        );
    }
}
