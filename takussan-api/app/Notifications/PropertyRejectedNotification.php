<?php

namespace App\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\NotificationType;
use App\Models\Property;
use App\Models\User;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PropertyRejectedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'property_moderation';

    public function __construct(
        public Property $property,
        public string $rejectionReason,
    ) {}

    public function via(object $notifiable): array
    {
        $resolver = app(PreferenceResolver::class);
        $channels = [];

        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_INAPP)) {
            $channels[] = 'database';
        }
        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_EMAIL)) {
            $channels[] = 'mail';
        }
        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_PUSH)) {
            $channels[] = 'broadcast';
        }

        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject($this->render($notifiable, 'mail_subject'))
            ->greeting(__('notifications.greeting'))
            ->line($this->render($notifiable, 'mail_body'))
            ->salutation(__('notifications.salutation'));
    }

    /**
     * TCK-588 (ADR-0032) — la ligne in-app porte le code `property.rejected`.
     *
     * @return array<string,mixed>
     */
    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::System,
            'code' => NotificationCode::PropertyRejected->value,
            'params' => $this->params(),
            'target' => NotificationTarget::of('property', $this->property->id)->toArray(),
            'title' => $this->render($notifiable, 'title'),
            'body' => $this->render($notifiable, 'body'),
            'data' => $this->toArray($notifiable),
        ];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'property_id' => $this->property->id,
            'property_title' => $this->property->title,
            'rejection_reason' => $this->rejectionReason,
            'title' => $this->render($notifiable, 'title'),
        ];
    }

    /** @return array{property: ?string, reason: string} */
    private function params(): array
    {
        return ['property' => $this->property->title, 'reason' => $this->rejectionReason];
    }

    private function render(object $notifiable, string $surface): string
    {
        return app(NotificationRenderer::class)->render(
            NotificationCode::PropertyRejected,
            $this->params(),
            app()->getLocale(),
            $notifiable instanceof User ? $notifiable->timezone : null,
            $surface,
        );
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'property.rejected';
    }
}
