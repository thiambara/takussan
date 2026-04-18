<?php

namespace App\Services\Model;

use App\Models\AppNotification;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use Illuminate\Support\Collection;

class NotificationService
{
    public function notify(
        User $user,
        NotificationType $type,
        string $title,
        string $body,
        array $data = [],
        NotificationChannel $channel = NotificationChannel::App,
        ?string $referenceableType = null,
        ?int $referenceableId = null,
    ): AppNotification {
        return AppNotification::create([
            'user_id' => $user->id,
            'type' => $type,
            'delivery_channel' => $channel,
            'title' => $title,
            'body' => $body,
            'data' => $data,
            'referenceable_type' => $referenceableType,
            'referenceable_id' => $referenceableId,
            'sent_at' => now(),
        ]);
    }

    /** @param Collection<int,User> $users */
    public function notifyMany(
        Collection $users,
        NotificationType $type,
        string $title,
        string $body,
        array $data = [],
        NotificationChannel $channel = NotificationChannel::App,
        ?string $referenceableType = null,
        ?int $referenceableId = null,
    ): void {
        foreach ($users as $user) {
            $this->notify($user, $type, $title, $body, $data, $channel, $referenceableType, $referenceableId);
        }
    }
}
