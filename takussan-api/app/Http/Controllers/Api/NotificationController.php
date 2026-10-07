<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\AppNotificationResource;
use App\Models\AppNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /** TCK-588 — `per_page` était recopié tel quel : `per_page=100000` rendait tout l'historique. */
    public const MAX_PER_PAGE = 50;

    public function index(Request $request): JsonResponse
    {
        $perPage = max(1, min(self::MAX_PER_PAGE, (int) $request->input('per_page', 20)));

        $paginator = AppNotification::where('user_id', $request->user()->id)
            ->when($request->boolean('filter.unread'), fn ($query) => $query->whereNull('read_at'))
            ->latest()
            ->latest('id')
            ->paginate($perPage);

        return $this->json([
            'data' => AppNotificationResource::collection($paginator->items())->toArray($request),
            'meta' => $this->paginationMeta($paginator, [
                'unread' => AppNotification::where('user_id', $request->user()->id)
                    ->whereNull('read_at')
                    ->count(),
            ]),
        ]);
    }

    public function markAsRead(Request $request, AppNotification $notification): JsonResponse
    {
        abort_unless($notification->user_id === $request->user()->id, 403);
        $notification->update(['read_at' => now(), 'is_read' => true]);

        return $this->json(['data' => AppNotificationResource::make($notification)->toArray($request)]);
    }

    public function markAsUnread(Request $request, AppNotification $notification): JsonResponse
    {
        abort_unless($notification->user_id === $request->user()->id, 403);
        $notification->update(['read_at' => null, 'is_read' => false]);

        return $this->json(['data' => AppNotificationResource::make($notification)->toArray($request)]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        AppNotification::where('user_id', $request->user()->id)
            ->whereNull('read_at')
            ->update(['read_at' => now(), 'is_read' => true]);

        return $this->json(['message' => 'ok']);
    }
}
