<?php

namespace App\Services\Model;

use App\Events\NewNotification;
use App\Models\AppNotification;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Mail;

class NotificationService
{
    /**
     * Map the app's business NotificationType enum to the canonical
     * event_type strings consumed by {@see PreferenceResolver}. When a
     * type isn't mapped, we fall back to the raw enum value which simply
     * skips per-user preferences (defaults apply).
     *
     * @var array<string,string>
     */
    private const TYPE_TO_EVENT = [
        'booking' => 'booking_request',
        'payment' => 'lease_payment_due',
        'lease' => 'lease_payment_due',
        'maintenance' => 'maintenance_status_changed',
        'visit' => 'visit_reminder',
        'message' => 'message_received',
        'system' => 'threshold_alert',
    ];

    public function __construct(private readonly PreferenceResolver $resolver) {}

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
        $eventType = self::TYPE_TO_EVENT[$type->value] ?? $type->value;

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

        // Email fan-out — gated by the user's per-event preference.
        if ($user->email && $this->resolver->shouldSend($user, $eventType, PreferenceResolver::CHANNEL_EMAIL)) {
            $this->sendEmail($user, $title, $body);
        }

        if (class_exists(NewNotification::class)) {
            try {
                event(new NewNotification($notification));
            } catch (\Throwable) {
                // Broadcasting not configured — silently skip.
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
            // Mail not configured in this environment — silently skip.
        }
    }
}
