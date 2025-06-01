<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StorePropertyRequest;
use App\Http\Requests\UpdatePropertyRequest;
use App\Models\Property;
use App\Services\Model\PropertyService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Spatie\MediaLibrary\MediaCollections\Exceptions\FileDoesNotExist;
use Spatie\MediaLibrary\MediaCollections\Exceptions\FileIsTooBig;

class PropertyController extends Controller
{
    protected PropertyService $propertyService;

    public function __construct(PropertyService $propertyService)
    {
        $this->propertyService = $propertyService;
//        $this->middleware('permission:properties.view')->only(['index', 'show']);
//        $this->middleware('permission:properties.create')->only(['create', 'store']);
//        $this->middleware('permission:properties.update')->only(['edit', 'update']);
//        $this->middleware('permission:properties.delete')->only(['destroy']);
    }

    /**
     * Display a listing of the properties.
     */
    public function index(): JsonResponse
    {
        $query = Property::allThroughRequest();

        // Show only user's properties if not admin
        if (!Auth::user()->hasPermission('properties.view_all')) {
            $query->where('user_id', Auth::id());
        }

        if ($searchQuery = request('search_query')) {
            $query->where(fn(Builder $query) => $query
                ->where('title', 'like', "%$searchQuery%")
                ->orWhere('description', 'like', "%$searchQuery%")
            );
        }

        return response()->json($query->paginatedThroughRequest());
    }

    /**
     * Store a newly created property in storage.
     */
    public function store(StorePropertyRequest $request): JsonResponse
    {
        $property = $this->propertyService->store($request->validated());

        return response()->json($property->load(['address', 'tags']), 201);
    }

    /**
     * Display the specified property.
     */
    public function show(Property $property): JsonResponse
    {
        // Check if user can view this property
        if (!Auth::user()->hasPermission('properties.view_all') && $property->user_id !== Auth::id()) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        $property->load(['address', 'user', 'tags', 'parent', 'children']);

        return response()->json($property);
    }

    /**
     * Update the specified property in storage.
     */
    public function update(UpdatePropertyRequest $request, Property $property): JsonResponse
    {
        // Check if user can edit this property
        if (!Auth::user()->hasPermission('properties.update_all') && $property->user_id !== Auth::id()) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        $property = $this->propertyService->update($property, $request->validated());

        return response()->json($property->load(['address', 'tags']));
    }

    /**
     * Remove the specified property from storage.
     */
    public function destroy(Property $property): JsonResponse
    {
        // Check if user can delete this property
        if (!Auth::user()->hasPermission('properties.delete_all') && $property->user_id !== Auth::id()) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        $this->propertyService->delete($property);

        return response()->json([
            'status' => 'success',
            'message' => 'Property deleted successfully'
        ]);
    }

    // Media

    /**
     * Upload media for a property
     */
    public function storeMedia(Request $request, Property $property): JsonResponse
    {
        // Check permissions
        if (!Auth::user()->hasPermission('properties.update_all') && $property->user_id !== Auth::id()) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        // Validate request
        $request->validate([
            'file' => 'required',
            'file.*' => 'file|mimes:jpeg,png,jpg,gif,mp4,mov,pdf,doc,docx|max:10240', // 10MB max
        ]);

        $uploadedMedia = [];

        try {
            foreach ($request->file('file') as $file) {
                $media = $property->addMedia($file)
                    ->withCustomProperties(['is_featured' => false])
                    ->toMediaCollection('properties');

                $uploadedMedia[] = $media;
            }
        } catch (FileDoesNotExist $e) {
            return response()->json([
                'status' => 'error',
                'message' => 'File not found: ' . $e->getMessage()
            ], 400);
        } catch (FileIsTooBig $e) {
            return response()->json([
                'status' => 'error',
                'message' => 'File too large: ' . $e->getMessage()
            ], 400);
        }

        return response()->json($uploadedMedia, 201);
    }

    /**
     * Delete a media item
     */
    public function destroyMedia(Property $property, int $mediaId): JsonResponse
    {
        // Check permissions
        if (!Auth::user()->hasPermission('properties.update_all') && $property->user_id !== Auth::id()) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        $media = $property->getMedia('properties')->firstWhere('id', $mediaId);

        if (!$media) {
            return response()->json([
                'status' => 'error',
                'message' => 'Media not found'
            ], 404);
        }

        $media->delete();

        return response()->json([
            'status' => 'success',
            'message' => 'Media deleted successfully'
        ]);
    }

    /**
     * Get all media for a property
     */
    public function getMedia(Property $property): JsonResponse
    {
        // Check permissions
        if (!Auth::user()->hasPermission('properties.view_all') && $property->user_id !== Auth::id()) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        return response()->json($property->getMedia('properties'));
    }

    /**
     * Set a media item as featured
     */
    public function setFeatured(Property $property, int $mediaId): JsonResponse
    {
        // Check permissions
        if (!Auth::user()->hasPermission('properties.update_all') && $property->user_id !== Auth::id()) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        $media = $property->getMedia('properties')->firstWhere('id', $mediaId);

        if (!$media) {
            return response()->json([
                'status' => 'error',
                'message' => 'Media not found'
            ], 404);
        }

        // Clear featured status from all media
        foreach ($property->getMedia('properties') as $item) {
            $item->setCustomProperty('is_featured', false);
            $item->save();
        }

        // Set this item as featured
        $media->setCustomProperty('is_featured', true);
        $media->save();

        return response()->json([
            'status' => 'success',
            'message' => 'Media set as featured successfully'
        ]);
    }
}
