<?php

namespace App\Notifications\Boost;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\NotificationType;
use App\Models\User;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * TCK-633 lot F (ADR-0061 §8, §9) — une Vedette ou un Badge a pris fin (échéance ou modération).
 *
 * TCK-2704 — la ligne de cloche porte le code `boost.ended` : la cloche la rend dans la langue de
 * qui la lit, et la range en `bien` (`NotificationClassification`).
 */
class BoostEndedNotification extends Notification
{
    use Queueable;

    public function __construct(public readonly int $propertyId, public readonly string $propertyTitle) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::System,
            'code' => NotificationCode::BoostEnded->value,
            'params' => $this->params(),
            'title' => $this->render($notifiable, 'title'),
            'body' => $this->render($notifiable, 'body'),
            'data' => $this->toArray($notifiable),
            'target' => NotificationTarget::of('property', $this->propertyId)->toArray(),
        ];
    }

    public function toArray(object $notifiable): array
    {
        return ['property_id' => $this->propertyId];
    }

    /** @return array{property: string} */
    private function params(): array
    {
        return ['property' => $this->propertyTitle];
    }

    private function render(object $notifiable, string $surface): string
    {
        return app(NotificationRenderer::class)->render(
            NotificationCode::BoostEnded,
            $this->params(),
            app()->getLocale(),
            $notifiable instanceof User ? $notifiable->timezone : null,
            $surface,
        );
    }
}
