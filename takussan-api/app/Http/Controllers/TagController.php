<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreTagRequest;
use App\Http\Requests\UpdateTagRequest;
use App\Models\Tag;
use App\Services\Model\TagService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class TagController extends Controller
{
    protected TagService $tagService;

    public function __construct(TagService $tagService)
    {
        $this->tagService = $tagService;
        $this->middleware('permission:tags.view')->only(['index', 'show']);
        $this->middleware('permission:tags.create')->only(['create', 'store']);
        $this->middleware('permission:tags.update')->only(['edit', 'update']);
        $this->middleware('permission:tags.delete')->only(['destroy']);
    }

    /**
     * Display a listing of the tags.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Tag::allThroughRequest();

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%$search%")
                    ->orWhere('slug', 'like', "%$search%")
                    ->orWhere('description', 'like', "%$search%");
            });
        }

        return response()->json($query->paginatedThroughRequest());
    }

    /**
     * Store a newly created tag in storage.
     * @throws Throwable
     */
    public function store(StoreTagRequest $request): JsonResponse
    {
        $tag = $this->tagService->store($request->validated());

        return response()->json([
            'status' => 'success',
            'message' => 'Tag created successfully',
            'data' => $tag
        ], 201);
    }

    /**
     * Display the specified tag.
     */
    public function show(Tag $tag): JsonResponse
    {
        return response()->json([
            'status' => 'success',
            'data' => $tag
        ]);
    }

    /**
     * Update the specified tag in storage.
     * @throws Throwable
     */
    public function update(UpdateTagRequest $request, Tag $tag): JsonResponse
    {
        $tag = $this->tagService->update($tag, $request->validated());

        return response()->json([
            'status' => 'success',
            'message' => 'Tag updated successfully',
            'data' => $tag
        ]);
    }

    /**
     * Remove the specified tag from storage.
     * @throws Throwable
     */
    public function destroy(Tag $tag): JsonResponse
    {
        $this->tagService->delete($tag);

        return response()->json([
            'status' => 'success',
            'message' => 'Tag deleted successfully'
        ]);
    }

    /**
     * Get tags by type.
     */
    public function getByType(Request $request): JsonResponse
    {
        $type = $request->get('type');
        $tags = $this->tagService->getByType($type);

        return response()->json([
            'status' => 'success',
            'data' => $tags
        ]);
    }
}
