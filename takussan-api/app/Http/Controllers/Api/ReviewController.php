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
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReviewController extends Controller
{
    /**
     * Global reviews listing — used by the admin moderation queue.
     * Supports `filter[moderation_status]=pending|flagged|approved|rejected`,
     * `filter[reported]=1`, sort by `-reported_count`, `-created_at`.
     * Only super_admin and admin roles can access.
     */
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        $query = Review::query()->with(['author', 'reviewable']);

        $status = $request->query('filter.moderation_status')
            ?? data_get($request->query('filter', []), 'moderation_status');
        if ($status) {
            // Map the UI statuses to internal ReviewStatus values.
            $statusMap = [
                'pending' => ReviewStatus::Pending,
                'flagged' => ReviewStatus::Reported,
                'reported' => ReviewStatus::Reported,
                'approved' => ReviewStatus::Approved,
                'rejected' => ReviewStatus::Rejected,
            ];
            if (isset($statusMap[$status])) {
                $query->where('status', $statusMap[$status]->value);
            }
        }

        $reported = $request->query('filter.reported')
            ?? data_get($request->query('filter', []), 'reported');
        if (in_array($reported, [1, '1', true, 'true'], true)) {
            $query->where('reported_count', '>', 0);
        }

        $subjectType = $request->query('filter.subject_type')
            ?? data_get($request->query('filter', []), 'subject_type');
        if ($subjectType) {
            $query->where('reviewable_type', $subjectType);
        }

        // Sorting — default surfaces the queue (most reported first, then fresh).
        $sort = (string) ($request->query('sort') ?? '-reported_count,-created_at');
        foreach (explode(',', $sort) as $spec) {
            $spec = trim($spec);
            if ($spec === '') {
                continue;
            }
            $direction = 'asc';
            if (str_starts_with($spec, '-')) {
                $direction = 'desc';
                $spec = substr($spec, 1);
            }
            if (in_array($spec, ['created_at', 'reported_count', 'rating', 'id'], true)) {
                $query->orderBy($spec, $direction);
            }
        }

        $perPage = (int) $request->input('per_page', 20);
        $paginator = $query->paginate($perPage);

        // Meta — include pending queue count for badge in the admin sidebar.
        $pendingCount = Review::query()
            ->whereIn('status', [ReviewStatus::Pending->value, ReviewStatus::Reported->value])
            ->count();

        return $this->json([
            'data' => ReviewResource::collection($paginator)->toArray($request),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'pending_count' => $pendingCount,
            ],
        ]);
    }

    /**
     * Unified moderation endpoint — admin queue uses this rather than the
     * split approve/reject/hide legacy routes. Body: `{ decision, reason? }`.
     */
    public function moderate(Request $request, Review $review): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        $data = $request->validate([
            'decision' => ['required', Rule::in(['approve', 'hide', 'delete', 'ignore'])],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $decision = $data['decision'];
        $reason = $data['reason'] ?? null;

        // Reason required for anything other than approve.
        if ($decision !== 'approve' && empty($reason)) {
            abort(422, __('validation.required', ['attribute' => 'reason']));
        }

        switch ($decision) {
            case 'approve':
                $this->assertTransition($review, ReviewStatus::Approved);
                $review->update([
                    'status' => ReviewStatus::Approved,
                    'is_approved' => true,
                    'approved_at' => now(),
                    'approved_by_id' => $request->user()->id,
                ]);
                break;

            case 'hide':
                $this->assertTransition($review, ReviewStatus::Rejected);
                $metadata = $review->metadata ?? [];
                $metadata['moderation_reason'] = $reason;
                $metadata['moderated_by_id'] = $request->user()->id;
                $metadata['moderated_at'] = now()->toISOString();
                $review->update([
                    'status' => ReviewStatus::Rejected,
                    'is_approved' => false,
                    'metadata' => $metadata,
                ]);
                break;

            case 'delete':
                $metadata = $review->metadata ?? [];
                $metadata['moderation_reason'] = $reason;
                $metadata['moderated_by_id'] = $request->user()->id;
                $metadata['moderated_at'] = now()->toISOString();
                $review->update([
                    'status' => ReviewStatus::Rejected,
                    'is_approved' => false,
                    'metadata' => $metadata,
                ]);
                $review->delete(); // soft-delete via SoftDeletes trait

                return $this->json([
                    'data' => ['id' => $review->id, 'deleted' => true],
                ]);

            case 'ignore':
                // Mark review as ignored (no status transition, just flag it).
                $metadata = $review->metadata ?? [];
                $metadata['ignored_reports_by_id'] = $request->user()->id;
                $metadata['ignored_reports_at'] = now()->toISOString();
                $metadata['ignored_reason'] = $reason;
                $review->update(['metadata' => $metadata]);
                break;
        }

        return $this->json([
            'data' => ReviewResource::make($review->refresh())->toArray($request),
        ]);
    }

    /**
     * List the reports filed against a review — used by the admin detail
     * panel. Joins reporter user data when possible.
     */
    public function reports(Request $request, Review $review): JsonResponse
    {
        abort_unless($request->user()->hasRole(['admin', 'super_admin']), 403);

        $reports = collect($review->metadata['reports'] ?? [])
            ->map(function (array $r): array {
                $userId = isset($r['user_id']) ? (int) $r['user_id'] : null;
                $user = $userId ? User::find($userId) : null;

                return [
                    'user_id' => $userId,
                    'user' => $user ? [
                        'id' => $user->id,
                        'name' => $user->full_name ?: $user->email,
                        'email' => $user->email,
                    ] : null,
                    'reason' => $r['reason'] ?? null,
                    'reported_at' => $r['reported_at'] ?? null,
                ];
            })
            ->values()
            ->all();

        return $this->json([
            'data' => $reports,
            'meta' => ['total' => count($reports)],
        ]);
    }

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

        // Rejected is a terminal state: no public-facing view, no reply.
        // Reply is not a ReviewStatus transition so assertTransition() does
        // not fit — just guard directly on the terminal state.
        abort_if(
            ($review->status ?? ReviewStatus::Pending) === ReviewStatus::Rejected,
            422,
            'Cannot reply to a rejected review.'
        );

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

        $userId = (int) $request->user()->id;

        $metadata = $review->metadata ?? [];
        $reports = $metadata['reports'] ?? [];

        // Dedupe: each user can only count as one report against a review.
        // Without this, a single user hitting the endpoint N times would
        // trigger the auto-report threshold and game the moderation queue.
        $alreadyReported = collect($reports)
            ->contains(fn ($r) => (int) ($r['user_id'] ?? 0) === $userId);

        if ($alreadyReported) {
            return $this->json(['message' => __('messages.review_reported')]);
        }

        $reports[] = [
            'user_id' => $userId,
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
