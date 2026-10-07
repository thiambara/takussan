<?php

namespace App\Notifications;

use App\Models\PropertyContactLead;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-590 — l'accusé de réception d'une demande de contact, au visiteur qui a laissé un e-mail.
 *
 * **E-mail seulement, et jamais de texte libre** (contrainte 4) : un numéro ou une adresse saisis
 * par un tiers ne doivent pas faire de la plateforme un relais — ni de SMS payants, ni d'un
 * message choisi par l'expéditeur. L'accusé ne recopie donc ni le message, ni le nom saisi : il
 * nomme le bien, qui est un texte de l'agence.
 */
class ContactLeadReceivedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public PropertyContactLead $lead) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $property = $this->lead->property?->title;

        return (new MailMessage)
            ->subject(__('notifications.contact_lead_received.subject'))
            ->greeting(__('notifications.contact_lead_received.greeting'))
            ->line($property !== null
                ? __('notifications.contact_lead_received.intro_property', ['property' => $property])
                : __('notifications.contact_lead_received.intro_agent'))
            ->line(__('notifications.contact_lead_received.next'))
            ->salutation(__('notifications.salutation'));
    }
}
