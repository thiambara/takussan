<?php

namespace App\Http\Controllers;

use App\Http\Requests\StorePropertyRequest;
use App\Http\Requests\UpdatePropertyRequest;
use App\Models\Property;
use App\Services\PropertyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class PropertyController extends Controller
{
    protected PropertyService $propertyService;

    public function __construct(PropertyService $propertyService)
    {
        $this->propertyService = $propertyService;
        $this->middleware('permission:properties.view')->only(['index', 'show']);
        $this->middleware('permission:properties.create')->only(['create', 'store']);
        $this->middleware('permission:properties.update')->only(['edit', 'update']);
        $this->middleware('permission:properties.delete')->only(['destroy']);
    }

    /**
     * Display a listing of the properties.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Property::query();
        
        // Apply filters
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }
        
        if ($request->has('type')) {
            $query->where('type', $request->type);
        }
        
        if ($request->has('contract_type')) {
            $query->where('contract_type', $request->contract_type);
        }

        if ($request->has('min_price')) {
            $query->where('price', '>=', $request->min_price);
        }

        if ($request->has('max_price')) {
            $query->where('price', '<=', $request->max_price);
        }

        if ($request->has('min_area')) {
            $query->where('area', '>=', $request->min_area);
        }

        if ($request->has('max_area')) {
            $query->where('area', '<=', $request->max_area);
        }

        // Show only user's properties if not admin
        if (!Auth::user()->hasPermission('properties.view_all')) {
            $query->where('user_id', Auth::id());
        }
        
        // Load relationships
        $query->with(['address', 'user']);
        
        // Paginate results
        $properties = $query->paginate($request->per_page ?? 15);
        
        return response()->json([
            'status' => 'success',
            'data' => $properties
        ]);
    }

    /**
     * Store a newly created property in storage.
     */
    public function store(StorePropertyRequest $request): JsonResponse
    {
        $property = $this->propertyService->store($request->validated());
        
        return response()->json([
            'status' => 'success',
            'message' => 'Property created successfully',
            'data' => $property->load(['address', 'tags'])
        ], 201);
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
        
        return response()->json([
            'status' => 'success',
            'data' => $property
        ]);
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
        
        return response()->json([
            'status' => 'success',
            'message' => 'Property updated successfully',
            'data' => $property->load(['address', 'tags'])
        ]);
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
