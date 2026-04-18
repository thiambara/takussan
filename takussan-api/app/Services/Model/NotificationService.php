<?php

namespace App\Services\Model;

use App\Events\NewNotification;
use App\Models\AppNotification;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Mail;

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
        $notification = AppNotification::create([
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

        // Send email if user has email notifications enabled
        if ($user->notifications_email_enabled && $user->email) {
            $this->sendEmail($user, $title, $body);
        }

        // Broadcast in real-time if broadcasting is configured
        if (class_exists(NewNotification::class)) {
            try {
                event(new NewNotification($notification));
            } catch (\Throwable) {
                // Broadcasting not configured — silently skip
            }
        }

        return $notification;
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

    protected function sendEmail(User $user, string $title, string $body): void
    {
        try {
            Mail::raw($body, function ($message) use ($user, $title) {
                $message->to($user->email)
                    ->subject($title);
            });
        } catch (\Throwable) {
            // Mail not configured in this environment — silently skip
        }
    }
}
