<?php

namespace App\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\NotificationType;
use App\Models\Property;
use App\Models\User;
use App\Notifications\Concerns\RetriesWithBackoff;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * TCK-587 (ADR-0031 §2) — un bailleur rattaché a PROPOSÉ un bien à son agence.
 *
 * Le bailleur ne crée plus un bien du catalogue : `POST /api/properties` lui impose un brouillon
 * privé, qu'il ne peut ni publier ni rendre public. Sans cette notification, la proposition
 * attendrait dans la liste de l'agence sans que personne ne sache qu'elle existe. Elle part vers
 * chaque administrateur ACTIF de l'agence, sur la cloche seulement (canal `database`).
 *
 * TCK-2704 — la ligne de cloche porte le code `property.proposed` : un bien à examiner, « à
 * traiter » pour l'admin (`NotificationClassification`). `data` garde sa forme (`type`, ids).
 */
class PropertyProposedNotification extends Notification implements ShouldQueue
{
    use Queueable;
    use RetriesWithBackoff;

    public const TYPE = 'property_proposed';

    public function __construct(public Property $property) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::System,
            'code' => NotificationCode::PropertyProposed->value,
            'params' => $this->params(),
            'target' => NotificationTarget::of('property', $this->property->id)->toArray(),
            'title' => $this->render($notifiable, 'title'),
            'body' => $this->render($notifiable, 'body'),
            'data' => $this->toArray($notifiable),
        ];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => self::TYPE,
            'property_id' => $this->property->id,
            'property_title' => $this->property->title,
            'proposed_by_id' => $this->property->user_id,
            'title' => __('notifications.property_proposed.title', ['title' => $this->property->title]),
        ];
    }

    /** @return array{property: string} */
    private function params(): array
    {
        return ['property' => (string) $this->property->title];
    }

    private function render(object $notifiable, string $surface): string
    {
        return app(NotificationRenderer::class)->render(
            NotificationCode::PropertyProposed,
            $this->params(),
            app()->getLocale(),
            $notifiable instanceof User ? $notifiable->timezone : null,
            $surface,
        );
    }
}
