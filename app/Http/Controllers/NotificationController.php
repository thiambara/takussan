<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\StoreNotificationRequest;
use App\Http\Requests\UpdateNotificationRequest;
use App\Models\Notification;
use App\Services\Model\NotificationService;
use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class NotificationController extends Controller
{
    protected NotificationService $notificationService;

    public function __construct(NotificationService $notificationService)
    {
        $this->notificationService = $notificationService;
        $this->middleware('permission:notifications.view')->only(['index', 'show', 'getAllUserNotifications']);
        $this->middleware('permission:notifications.manage')->only(['store', 'update', 'destroy', 'markAllAsRead', 'sendToUsers']);
    }

    /**
     * Display a listing of the current user's notifications.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = [];

        // Apply filters if provided
        if ($request->has('type')) {
            $filters['type'] = $request->type;
        }

        if ($request->has('is_read')) {
            $filters['is_read'] = $request->boolean('is_read');
        }

        if ($request->has('is_actioned')) {
            $filters['is_actioned'] = $request->boolean('is_actioned');
        }

        if ($request->has('reference_type')) {
            $filters['reference_type'] = $request->reference_type;
        }

        if ($request->has('reference_id')) {
            $filters['reference_id'] = $request->reference_id;
        }

        // Get notifications for current user
        $notifications = $this->notificationService->getUserNotifications(
            Auth::id(),
            $filters,
            $request->per_page ?? 15
        );

        return response()->json([
            'status' => 'success',
            'data' => $notifications,
            'unread_count' => $this->notificationService->getUnreadCount(Auth::id())
        ]);
    }

    /**
     * Get unread notification count for the current user.
     */
    public function getUnreadCount(): JsonResponse
    {
        $count = $this->notificationService->getUnreadCount(Auth::id());

        return response()->json([
            'status' => 'success',
            'data' => [
                'unread_count' => $count
            ]
        ]);
    }

    /**
     * Get all notifications for a specific user (admin only).
     */
    public function getAllUserNotifications(Request $request): JsonResponse
    {
        $request->validate([
            'user_id' => 'required|exists:users,id',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        $filters = [];

        // Apply filters if provided
        if ($request->has('type')) {
            $filters['type'] = $request->type;
        }

        if ($request->has('is_read')) {
            $filters['is_read'] = $request->boolean('is_read');
        }

        // Get notifications for specified user
        $notifications = $this->notificationService->getUserNotifications(
            $request->user_id,
            $filters,
            $request->per_page ?? 15
        );

        return response()->json([
            'status' => 'success',
            'data' => $notifications,
            'unread_count' => $this->notificationService->getUnreadCount($request->user_id)
        ]);
    }

    /**
     * Store a newly created notification in storage.
     */
    public function store(StoreNotificationRequest $request): JsonResponse
    {
        $notification = $this->notificationService->create($request->validated());

        return response()->json([
            'status' => 'success',
            'message' => 'Notification created successfully',
            'data' => $notification
        ], 201);
    }

    /**
     * Display the specified notification.
     */
    public function show(Notification $notification): JsonResponse
    {
        // Check if notification belongs to current user
        if ($notification->user_id !== Auth::id() && !Auth::user()->hasPermission('notifications.manage')) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        return response()->json([
            'status' => 'success',
            'data' => $notification
        ]);
    }

    /**
     * Mark the specified notification as read.
     */
    public function markAsRead(UpdateNotificationRequest $request, Notification $notification): JsonResponse
    {
        $notification = $this->notificationService->markAsRead($notification);

        return response()->json([
            'status' => 'success',
            'message' => 'Notification marked as read',
            'data' => $notification
        ]);
    }

    /**
     * Mark the specified notification as actioned.
     */
    public function markAsActioned(UpdateNotificationRequest $request, Notification $notification): JsonResponse
    {
        $notification = $this->notificationService->markAsActioned($notification);

        return response()->json([
            'status' => 'success',
            'message' => 'Notification marked as actioned',
            'data' => $notification
        ]);
    }

    /**
     * Mark all notifications as read for the current user.
     */
    public function markAllAsRead(Request $request): JsonResponse
    {
        $filters = [];

        // Apply filters if provided
        if ($request->has('type')) {
            $filters['type'] = $request->type;
        }

        if ($request->has('reference_type')) {
            $filters['reference_type'] = $request->reference_type;
        }

        if ($request->has('reference_id')) {
            $filters['reference_id'] = $request->reference_id;
        }

        $count = $this->notificationService->markAllAsRead(Auth::id(), $filters);

        return response()->json([
            'status' => 'success',
            'message' => $count . ' notifications marked as read',
            'unread_count' => $this->notificationService->getUnreadCount(Auth::id())
        ]);
    }

    /**
     * Remove the specified notification from storage.
     */
    public function destroy(UpdateNotificationRequest $request, Notification $notification): JsonResponse
    {
        $this->notificationService->delete($notification);

        return response()->json([
            'status' => 'success',
            'message' => 'Notification deleted successfully'
        ]);
    }

    /**
     * Send a notification to multiple users.
     */
    public function sendToUsers(Request $request): JsonResponse
    {
        $request->validate([
            'user_ids' => 'required|array',
            'user_ids.*' => 'exists:users,id',
            'type' => 'required|string|max:50',
            'title' => 'required|string|max:255',
            'content' => 'required|string',
            'reference_id' => 'nullable|integer',
            'reference_type' => 'nullable|string|max:255',
            'delivery_channel' => 'nullable|string|in:app,email,sms,push',
        ]);

        $count = 0;
        $errors = [];

        foreach ($request->user_ids as $userId) {
            try {
                $this->notificationService->create([
                    'user_id' => $userId,
                    'type' => $request->type,
                    'title' => $request->title,
                    'content' => $request->input('content'),
                    'reference_id' => $request->reference_id,
                    'reference_type' => $request->reference_type,
                    'delivery_channel' => $request->delivery_channel ?? 'app',
                ]);
                $count++;
            } catch (Exception $e) {
                $errors[] = "Failed to create notification for user ID $userId: {$e->getMessage()}";
            }
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Sent ' . $count . ' notifications successfully',
            'errors' => $errors
        ]);
    }
}
