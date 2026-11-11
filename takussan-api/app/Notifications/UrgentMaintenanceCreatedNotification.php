<?php

namespace App\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\NotificationType;
use App\Models\MaintenanceRequest;
use App\Models\User;
use App\Notifications\Concerns\RetriesWithBackoff;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Une intervention urgente : créée, passée en urgent, ou escaladée faute de prise en charge.
 *
 * TCK-2704 — la ligne de cloche porte un code, `maintenance.urgent_created` (création, passage en
 * urgent) ou `maintenance.urgent_escalated` : « à traiter » pour l'agence
 * (`NotificationClassification`). L'e-mail et la diffusion ne changent pas.
 */
class UrgentMaintenanceCreatedNotification extends Notification implements ShouldQueue
{
    use Queueable;
    use RetriesWithBackoff;

    public const EVENT_TYPE = 'maintenance_status_changed';

    public function __construct(
        public MaintenanceRequest $maintenanceRequest,
        public bool $isEscalation = false,
        // TCK-1991 (P169.03) — la demande existait et vient de passer en urgent (`PATCH`).
        public bool $becameUrgent = false,
    ) {
        $this->onQueue('notifications-urgent');
    }

    public function via(object $notifiable): array
    {
        $resolver = app(PreferenceResolver::class);

        // In-app is mandatory for urgent — bypass per-user prefs (CHANNEL_INAPP
        // is locked-on in PreferenceResolver, but we hardcode `database` to be
        // explicit about the contract for an urgent event).
        $channels = ['database'];

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
        $title = $this->maintenanceRequest->title;

        $mail = (new MailMessage)
            ->subject(__($this->isEscalation
                ? 'notifications.urgent_maintenance.subject_escalation'
                : 'notifications.urgent_maintenance.subject', ['title' => $title]))
            ->greeting(__('notifications.urgent_maintenance.greeting'));

        if ($this->isEscalation) {
            $mail->line(__('notifications.urgent_maintenance.intro_escalation', [
                'id' => $this->maintenanceRequest->id,
                'title' => $title,
            ]));
        } else {
            $mail->line(__($this->becameUrgent
                ? 'notifications.urgent_maintenance.intro_became_urgent'
                : 'notifications.urgent_maintenance.intro'))
                ->line(__('notifications.urgent_maintenance.job', ['title' => $title]));
        }

        return $mail
            ->line(__('notifications.urgent_maintenance.cta'))
            ->salutation(__('notifications.salutation'));
    }

    /** @return array<string, mixed> */
    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::Maintenance,
            'code' => $this->code()->value,
            'params' => $this->params(),
            'target' => NotificationTarget::of('maintenance', $this->maintenanceRequest->id)->toArray(),
            'title' => $this->render($notifiable, 'title'),
            'body' => $this->render($notifiable, 'body'),
            'data' => $this->toArray($notifiable),
        ];
    }

    public function code(): NotificationCode
    {
        return $this->isEscalation ? NotificationCode::MaintenanceUrgentEscalated : NotificationCode::MaintenanceUrgentCreated;
    }

    /** @return array{title: string} */
    private function params(): array
    {
        return ['title' => (string) $this->maintenanceRequest->title];
    }

    private function render(object $notifiable, string $surface): string
    {
        return app(NotificationRenderer::class)->render(
            $this->code(),
            $this->params(),
            app()->getLocale(),
            $notifiable instanceof User ? $notifiable->timezone : null,
            $surface,
        );
    }

    public function toArray(object $notifiable): array
    {
        return [
            'maintenance_request_id' => $this->maintenanceRequest->id,
            'title' => __($this->isEscalation
                ? 'notifications.urgent_maintenance.title_escalation'
                : 'notifications.urgent_maintenance.title', [
                    'title' => $this->maintenanceRequest->title,
                ]),
            'priority' => 'urgent',
            'escalation' => $this->isEscalation,
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return $this->isEscalation ? 'maintenance.urgent_escalated' : 'maintenance.urgent_created';
    }
}
