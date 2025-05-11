<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Services\ActivityLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ActivityLogController extends Controller
{
    protected ActivityLogService $activityLogService;

    public function __construct(ActivityLogService $activityLogService)
    {
        $this->activityLogService = $activityLogService;
        $this->middleware('permission:logs.view')->only(['index', 'show', 'getUserActivities', 'getModelActivities']);
        $this->middleware('permission:logs.delete')->only(['destroy']);
    }

    /**
     * Display a listing of the activity logs.
     */
    public function index(Request $request): JsonResponse
    {
        $query = ActivityLog::query();
        
        // Apply filters
        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }
        
        if ($request->has('action')) {
            $query->where('action', $request->action);
        }
        
        if ($request->has('loggable_type')) {
            $modelType = $request->loggable_type;
            
            // Handle shorthand model types
            if (!str_contains($modelType, '\\')) {
                $modelType = 'App\\Models\\' . ucfirst($modelType);
            }
            
            $query->where('loggable_type', $modelType);
        }
        
        if ($request->has('loggable_id')) {
            $query->where('loggable_id', $request->loggable_id);
        }
        
        if ($request->has('date_from')) {
            $query->where('created_at', '>=', $request->date_from);
        }

        if ($request->has('date_to')) {
            $query->where('created_at', '<=', $request->date_to);
        }
        
        // Load relationships
        $query->with(['user']);
        
        // Order by creation date, newest first by default
        $query->orderBy('created_at', 'desc');
        
        // Paginate results
        $logs = $query->paginate($request->per_page ?? 15);
        
        return response()->json([
            'status' => 'success',
            'data' => $logs
        ]);
    }

    /**
     * Display the specified activity log.
     */
    public function show(ActivityLog $activityLog): JsonResponse
    {
        $activityLog->load(['user']);
        
        return response()->json([
            'status' => 'success',
            'data' => $activityLog
        ]);
    }

    /**
     * Remove the specified activity log from storage.
     */
    public function destroy(ActivityLog $activityLog): JsonResponse
    {
        $activityLog->delete();
        
        return response()->json([
            'status' => 'success',
            'message' => 'Activity log deleted successfully'
        ]);
    }
    
    /**
     * Get activities for a specific user.
     */
    public function getUserActivities(Request $request): JsonResponse
    {
        $request->validate([
            'user_id' => 'required|exists:users,id',
            'limit' => 'nullable|integer|min:1|max:100',
        ]);
        
        $userId = $request->user_id;
        $limit = $request->limit ?? 15;
        
        // Only allow viewing another user's activities with permission
        if ($userId != Auth::id() && !Auth::user()->hasPermission('logs.view_all')) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }
        
        $activities = $this->activityLogService->getUserActivities($userId, $limit);
        
        return response()->json([
            'status' => 'success',
            'data' => $activities
        ]);
    }
    
    /**
     * Get activities for a specific model.
     */
    public function getModelActivities(Request $request): JsonResponse
    {
        $request->validate([
            'model_type' => 'required|string',
            'model_id' => 'required|integer',
            'limit' => 'nullable|integer|min:1|max:100',
        ]);
        
        $modelType = $request->model_type;
        
        // Handle shorthand model types
        if (!str_contains($modelType, '\\')) {
            $modelType = 'App\\Models\\' . ucfirst($modelType);
        }
        
        $modelId = $request->model_id;
        $limit = $request->limit ?? 15;
        
        $activities = $this->activityLogService->getModelActivities($modelType, $modelId, $limit);
        
        return response()->json([
            'status' => 'success',
            'data' => $activities
        ]);
    }
    
    /**
     * Get system logs.
     */
    public function getSystemLogs(Request $request): JsonResponse
    {
        $limit = $request->limit ?? 15;
        
        $logs = ActivityLog::where('loggable_type', 'System')
            ->with('user')
            ->orderBy('created_at', 'desc')
            ->paginate($limit);
        
        return response()->json([
            'status' => 'success',
            'data' => $logs
        ]);
    }
}
