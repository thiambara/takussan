<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StorePropertyRequest;
use App\Http\Requests\UpdatePropertyRequest;
use App\Models\Property;
use App\Services\Model\PropertyService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

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
}
