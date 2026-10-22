<?php

namespace App\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\NotificationType;
use App\Models\Property;
use App\Models\User;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PropertyApprovedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Property $property) {}

    /**
     * TCK-1193 (P75.02) — non désactivable, comme le dit déjà le code
     * (`NotificationCode::PropertyApproved->preferenceEvent()` → `null`, TCK-782) : l'événement
     * `property_moderation` que `via()` passait au résolveur n'avait aucun interrupteur.
     *
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['database', 'mail', 'broadcast'];
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
     * TCK-588 (ADR-0032) — la ligne in-app porte le code `property.approved` : la cloche la
     * rend dans la langue de qui la lit, plus dans le français de l'envoi.
     *
     * @return array<string,mixed>
     */
    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::System,
            'code' => NotificationCode::PropertyApproved->value,
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
            'title' => $this->render($notifiable, 'title'),
        ];
    }

    /** @return array{property: ?string} */
    private function params(): array
    {
        return ['property' => $this->property->title];
    }

    private function render(object $notifiable, string $surface): string
    {
        return app(NotificationRenderer::class)->render(
            NotificationCode::PropertyApproved,
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
        return 'property.approved';
    }
}
