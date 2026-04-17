<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\ReviewResource;
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
        $data = $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'title' => ['nullable', 'string'],
            'content' => ['nullable', 'string'],
        ]);

        $review = $property->reviews()->create(array_merge($data, [
            'author_id' => $request->user()->id,
            'is_approved' => false,
        ]));

        return $this->json(['data' => ReviewResource::make($review)->toArray($request)], 201);
    }

    public function reply(Request $request, Review $review): JsonResponse
    {
        $data = $request->validate([
            'reply_content' => ['required', 'string'],
        ]);

        $review->update([
            'reply_content' => $data['reply_content'],
            'replied_by_id' => $request->user()->id,
            'replied_at' => now(),
        ]);

        return $this->json(['data' => ReviewResource::make($review->refresh())->toArray($request)]);
    }

    public function approve(Request $request, Review $review): JsonResponse
    {
        $review->update(['is_approved' => true, 'approved_at' => now()]);

        return $this->json(['data' => ReviewResource::make($review->refresh())->toArray($request)]);
    }
}
