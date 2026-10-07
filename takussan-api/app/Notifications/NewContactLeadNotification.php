<?php

namespace App\Notifications;

use App\Models\Enums\NotificationType;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-590 — une demande de contact arrive chez son destinataire : le contact principal du bien,
 * l'agent contacté, ou — à défaut — les admins de l'agence.
 *
 * Elle remplace l'appel direct à `NotificationService::notify()` : un titre français
 * figé quelle que soit la langue de l'agent, un corps de **80 caractères** du message, et **sans
 * le téléphone** — l'agent recevait de quoi savoir qu'on l'avait contacté, pas de quoi répondre.
 * Ici : le message entier, le téléphone, l'e-mail, et le lien vers la demande.
 */
class NewContactLeadNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'message_received';

    /** La boîte « Demandes » de la console (front). */
    public const PAGE = '/app/leads';

    public function __construct(public PropertyContactLead $lead) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        if (! $notifiable instanceof User) {
            return [];
        }

        $channels = ['database'];
        if (app(PreferenceResolver::class)->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_EMAIL)) {
            $channels[] = 'mail';
        }

        return $channels;
    }

    /** Le moyen de joindre le visiteur : téléphone d'abord, e-mail à défaut. */
    private function joindre(): string
    {
        return implode(' · ', array_filter([$this->lead->phone, $this->lead->email])) ?: '—';
    }

    public function titre(): string
    {
        return __('notifications.contact_lead.title', [
            'name' => $this->lead->name ?? '—',
            'contact' => $this->joindre(),
        ]);
    }

    public function lien(): string
    {
        $frontend = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');

        return $frontend.self::PAGE.'?lead='.$this->lead->id;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $property = $this->lead->property?->title;

        $mail = (new MailMessage)
            ->subject($this->titre())
            ->greeting(__('notifications.contact_lead.greeting'))
            ->line($property !== null
                ? __('notifications.contact_lead.intro_property', ['property' => $property])
                : __('notifications.contact_lead.intro_agent'))
            ->line(__('notifications.contact_lead.from', ['name' => $this->lead->name ?? '—', 'contact' => $this->joindre()]));

        if ($this->lead->message !== null) {
            $mail->line($this->lead->message);
        }

        return $mail
            ->action(__('notifications.contact_lead.action'), $this->lien())
            ->salutation(__('notifications.salutation'));
    }

    /**
     * @return array{type: NotificationType, title: string, body: ?string, data: array<string,mixed>}
     */
    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::Message,
            'title' => $this->titre(),
            'body' => $this->lead->message,
            'data' => [
                'lead_id' => $this->lead->id,
                'property_id' => $this->lead->property_id,
                'url' => self::PAGE.'?lead='.$this->lead->id,
            ],
        ];
    }
}
