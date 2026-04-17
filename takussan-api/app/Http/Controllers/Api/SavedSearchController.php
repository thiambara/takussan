<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\SavedSearchResource;
use App\Models\SavedSearch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SavedSearchController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $searches = SavedSearch::where('user_id', $request->user()->id)->latest()->get();

        return $this->json([
            'data' => SavedSearchResource::collection($searches)->toArray($request),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string'],
            'criteria' => ['required', 'array'],
            'notification_frequency' => ['nullable', 'in:off,daily,weekly,instant'],
        ]);

        $search = SavedSearch::create(array_merge($data, [
            'user_id' => $request->user()->id,
            'is_active' => true,
        ]));

        return $this->json([
            'data' => SavedSearchResource::make($search)->toArray($request),
        ], 201);
    }

    public function update(Request $request, SavedSearch $savedSearch): JsonResponse
    {
        abort_unless($savedSearch->user_id === $request->user()->id, 403);

        $data = $request->validate([
            'name' => ['sometimes', 'string'],
            'criteria' => ['sometimes', 'array'],
            'notification_frequency' => ['sometimes', 'in:off,daily,weekly,instant'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $savedSearch->fill($data)->save();

        return $this->json([
            'data' => SavedSearchResource::make($savedSearch->refresh())->toArray($request),
        ]);
    }

    public function destroy(Request $request, SavedSearch $savedSearch): JsonResponse
    {
        abort_unless($savedSearch->user_id === $request->user()->id, 403);
        $savedSearch->delete();

        return $this->json(['message' => 'deleted'], 204);
    }
}
