<?php

namespace App\Services\Model;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Pagination\LengthAwarePaginator;

class NotificationService
{
    /**
     * Get user notifications
     */
    public function getUserNotifications(int $userId, array $filters = [], int $perPage = 15): LengthAwarePaginator
    {
        $query = Notification::where('user_id', $userId);

        // Apply filters
        if (isset($filters['type'])) {
            $query->where('type', $filters['type']);
        }

        if (isset($filters['is_read'])) {
            $query->where('is_read', $filters['is_read']);
        }

        if (isset($filters['is_actioned'])) {
            $query->where('is_actioned', $filters['is_actioned']);
        }

        if (isset($filters['reference_type'])) {
            $referenceType = $filters['reference_type'];

            // Handle shorthand model types
            if (!str_contains($referenceType, '\\')) {
                $referenceType = 'App\\Models\\' . ucfirst($referenceType);
            }

            $query->where('reference_type', $referenceType);
        }

        if (isset($filters['reference_id'])) {
            $query->where('reference_id', $filters['reference_id']);
        }

        if (isset($filters['delivered'])) {
            $query->where('delivered', $filters['delivered']);
        }

        if (isset($filters['delivery_channel'])) {
            $query->where('delivery_channel', $filters['delivery_channel']);
        }

        // Order by creation date, newest first
        $query->orderBy('created_at', 'desc');

        return $query->paginate($perPage);
    }

    /**
     * Mark notification as actioned
     */
    public function markAsActioned(Notification $notification): Notification
    {
        // Mark as read first if not already read
        if (!$notification->is_read) {
            $this->markAsRead($notification);
        }

        if (!$notification->is_actioned) {
            $notification->update([
                'is_actioned' => true,
                'actioned_at' => now(),
            ]);
        }

        return $notification;
    }

    /**
     * Mark notification as read
     */
    public function markAsRead(Notification $notification): Notification
    {
        if (!$notification->is_read) {
            $notification->update([
                'is_read' => true,
                'read_at' => now(),
            ]);
        }

        return $notification;
    }

    /**
     * Mark all user notifications as read
     */
    public function markAllAsRead(int $userId, array $filters = []): int
    {
        $query = Notification::where('user_id', $userId)
            ->where('is_read', false);

        // Apply filters
        if (isset($filters['type'])) {
            $query->where('type', $filters['type']);
        }

        if (isset($filters['reference_type'])) {
            $referenceType = $filters['reference_type'];

            // Handle shorthand model types
            if (!str_contains($referenceType, '\\')) {
                $referenceType = 'App\\Models\\' . ucfirst($referenceType);
            }

            $query->where('reference_type', $referenceType);
        }

        if (isset($filters['reference_id'])) {
            $query->where('reference_id', $filters['reference_id']);
        }

        return $query->update([
            'is_read' => true,
            'read_at' => now(),
        ]);
    }

    /**
     * Delete a notification
     */
    public function delete(Notification $notification): bool
    {
        return $notification->delete();
    }

    /**
     * Create a system notification for a user
     */
    public function createSystemNotification(User $user, string $title, string $content, array $options = []): Notification
    {
        $data = [
            'user_id' => $user->id,
            'type' => 'system',
            'title' => $title,
            'content' => $content,
            'delivered' => $options['delivered'] ?? true,
            'delivery_channel' => $options['delivery_channel'] ?? 'app',
        ];

        if (isset($options['reference_id']) && isset($options['reference_type'])) {
            $data['reference_id'] = $options['reference_id'];
            $data['reference_type'] = $options['reference_type'];
        }

        return $this->create($data);
    }

    /**
     * Create a new notification
     */
    public function create(array $data): Notification
    {
        // Set default values if not provided
        $data['delivered'] = $data['delivered'] ?? true;
        $data['delivery_channel'] = $data['delivery_channel'] ?? 'app';

        if ($data['delivered']) {
            $data['delivered_at'] = $data['delivered_at'] ?? now();
        }

        return Notification::create($data);
    }

    /**
     * Create a notification for a reference model
     */
    public function createModelNotification(User $user, Model $reference, string $type, string $title, string $content, array $options = []): Notification
    {
        $data = [
            'user_id' => $user->id,
            'type' => $type,
            'title' => $title,
            'content' => $content,
            'reference_id' => $reference->id,
            'reference_type' => get_class($reference),
            'delivered' => $options['delivered'] ?? true,
            'delivery_channel' => $options['delivery_channel'] ?? 'app',
        ];

        return $this->create($data);
    }

    /**
     * Get unread notification count for user
     */
    public function getUnreadCount(int $userId): int
    {
        return Notification::where('user_id', $userId)
            ->where('is_read', false)
            ->count();
    }
}
