<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Models\ActivityLog;
use App\Services\Model\ActivityLogService;
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
    public function index(): JsonResponse
    {
        $query = ActivityLog::allThroughRequest();
        return response()->json($query->paginatedThroughRequest());
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
