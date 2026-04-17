<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\AppNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $paginator = AppNotification::where('user_id', $request->user()->id)
            ->latest()
            ->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => $paginator->items(),
            'meta' => [
                'total' => $paginator->total(),
                'unread' => AppNotification::where('user_id', $request->user()->id)
                    ->whereNull('read_at')
                    ->count(),
                'current_page' => $paginator->currentPage(),
            ],
        ]);
    }

    public function markAsRead(Request $request, AppNotification $notification): JsonResponse
    {
        abort_unless($notification->user_id === $request->user()->id, 403);
        $notification->update(['read_at' => now()]);

        return $this->json(['data' => $notification]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        AppNotification::where('user_id', $request->user()->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return $this->json(['message' => 'ok']);
    }
}
