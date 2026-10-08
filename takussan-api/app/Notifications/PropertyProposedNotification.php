<?php

namespace App\Notifications;

use App\Models\Property;
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
 */
class PropertyProposedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const TYPE = 'property_proposed';

    public function __construct(public Property $property) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
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
}
