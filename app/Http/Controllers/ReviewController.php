<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreReviewRequest;
use App\Http\Requests\UpdateReviewRequest;
use App\Models\Review;
use App\Services\Model\ReviewService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Throwable;

class ReviewController extends Controller
{
    protected ReviewService $reviewService;

    public function __construct(ReviewService $reviewService)
    {
        $this->reviewService = $reviewService;
        $this->middleware('permission:reviews.view')->only(['index', 'show', 'getPending']);
        $this->middleware('permission:reviews.create')->only(['create', 'store']);
        $this->middleware('permission:reviews.update')->only(['edit', 'update']);
        $this->middleware('permission:reviews.delete')->only(['destroy']);
        $this->middleware('permission:reviews.approve')->only(['approve', 'reject']);
    }

    /**
     * Display a listing of the reviews.
     */
    public function index(): JsonResponse
    {
        $query = Review::allThroughRequest();
        return response()->json($query->paginatedThroughRequest());
    }

    /**
     * Store a newly created review in storage.
     * @throws Throwable
     */
    public function store(StoreReviewRequest $request): JsonResponse
    {
        $review = $this->reviewService->store($request->validated());

        return response()->json([
            'status' => 'success',
            'message' => 'Review submitted successfully' . ($review->is_approved ? '' : '. It will be visible after moderation'),
            'data' => $review->load(['user'])
        ], 201);
    }

    /**
     * Display the specified review.
     */
    public function show(Review $review): JsonResponse
    {
        // Check if user can view this review if it's not approved
        if (!$review->is_approved && !Auth::user()->hasPermission('reviews.view') && $review->user_id !== Auth::id()) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        $review->load(['user', 'approver']);

        return response()->json([
            'status' => 'success',
            'data' => $review
        ]);
    }

    /**
     * Update the specified review in storage.
     * @throws Throwable
     */
    public function update(UpdateReviewRequest $request, Review $review): JsonResponse
    {
        $review = $this->reviewService->update($review, $request->validated());

        return response()->json([
            'status' => 'success',
            'message' => 'Review updated successfully',
            'data' => $review->load(['user', 'approver'])
        ]);
    }

    /**
     * Remove the specified review from storage.
     * @throws Throwable
     */
    public function destroy(Review $review): JsonResponse
    {
        // Check if user can delete this review
        if (!Auth::user()->hasPermission('reviews.delete') && $review->user_id !== Auth::id()) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        $this->reviewService->delete($review);

        return response()->json([
            'status' => 'success',
            'message' => 'Review deleted successfully'
        ]);
    }

    /**
     * Approve a review.
     * @throws Throwable
     */
    public function approve(Review $review): JsonResponse
    {
        $review = $this->reviewService->approve($review);

        return response()->json([
            'status' => 'success',
            'message' => 'Review approved successfully',
            'data' => $review
        ]);
    }

    /**
     * Reject a review.
     * @throws Throwable
     */
    public function reject(Review $review): JsonResponse
    {
        $review = $this->reviewService->reject($review);

        return response()->json([
            'status' => 'success',
            'message' => 'Review rejected successfully',
            'data' => $review
        ]);
    }

    /**
     * Report a review.
     * @throws Throwable
     */
    public function report(Review $review): JsonResponse
    {
        $review = $this->reviewService->report($review);

        return response()->json([
            'status' => 'success',
            'message' => 'Review reported successfully',
            'data' => [
                'reported_count' => $review->reported_count,
                'is_approved' => $review->is_approved
            ]
        ]);
    }

    /**
     * Get reviews for a specific model.
     */
    public function getForModel(Request $request): JsonResponse
    {
        $request->validate([
            'model_type' => 'required|string',
            'model_id' => 'required|integer',
            'approved_only' => 'nullable|boolean',
        ]);

        $modelType = $request->model_type;

        // Handle shorthand model types
        if (!str_contains($modelType, '\\')) {
            $modelType = 'App\\Models\\' . ucfirst($modelType);
        }

        $approvedOnly = $request->boolean('approved_only', true);

        // If requesting non-approved reviews, check permissions
        if (!$approvedOnly && !Auth::user()->hasPermission('reviews.view')) {
            $approvedOnly = true;
        }

        $reviews = $this->reviewService->getReviewsForModel(
            $modelType,
            $request->model_id,
            $approvedOnly
        );

        return response()->json([
            'status' => 'success',
            'data' => $reviews
        ]);
    }
}
