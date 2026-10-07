<?php

namespace App\Notifications;

use App\Models\Enums\NotificationType;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\Concerns\SupportsSms;
use App\Services\Notifications\PreferenceResolver;
use App\Support\HeureDeVisite;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-590 — ce que les notifications d'une visite ont en commun : à qui, par où, et l'heure à
 * Dakar suivie du fuseau.
 *
 * **Deux sortes de destinataires.** Un compte (`User`) reçoit le fil in-app et, selon ses
 * préférences de l'événement `visit_reminder`, l'e-mail, le push et le SMS. Un visiteur SANS
 * compte est un `AnonymousNotifiable` dont les routes `mail` / `sms` sont son e-mail et son
 * téléphone saisis : il n'a ni préférences ni fil, et `PreferenceResolver::shouldSend()` exige un
 * `User` — l'appeler pour lui levait. `notifyConfirmed` sortait donc dès que `visitor` était nul :
 * le visiteur sans compte n'était jamais prévenu.
 *
 * **Anti-abus (contrainte 4).** Seules les classes qui suivent un geste HUMAIN de l'agence
 * (confirmation, replanification, annulation) déclarent {@see self::envoieUnSms()}. Aucune ne
 * recopie un texte libre du visiteur : ni son message, ni le nom qu'il a saisi.
 */
abstract class VisitNotification extends Notification implements ShouldQueue, SupportsSms
{
    use Queueable;

    public const EVENT_TYPE = 'visit_reminder';

    public function __construct(public PropertyVisit $visit) {}

    /** Le préfixe des clés `notifications.<cle>.*`. */
    abstract protected function cle(): string;

    abstract public function broadcastType(): string;

    /** Un SMS suit-il cet événement ? Jamais au dépôt d'une demande (contrainte 4). */
    protected function envoieUnSms(): bool
    {
        return false;
    }

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        if ($notifiable instanceof AnonymousNotifiable) {
            $channels = [];
            if (! empty($notifiable->routes['mail'])) {
                $channels[] = 'mail';
            }
            if ($this->envoieUnSms() && ! empty($notifiable->routes['sms'])) {
                $channels[] = 'sms';
            }

            return $channels;
        }

        if (! $notifiable instanceof User) {
            return [];
        }

        $resolver = app(PreferenceResolver::class);
        $channels = ['database'];

        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_EMAIL)) {
            $channels[] = 'mail';
        }
        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_PUSH)) {
            $channels[] = 'broadcast';
        }
        if ($this->envoieUnSms() && $resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_SMS)) {
            $channels[] = 'sms';
        }

        return $channels;
    }

    protected function titreDuBien(): string
    {
        return $this->visit->property?->title ?? '#'.$this->visit->id;
    }

    /** L'heure de la visite, à Dakar, suivie du fuseau, dans la langue de l'envoi. */
    public function heure(): string
    {
        return HeureDeVisite::pour($this->visit->scheduled_at);
    }

    public function sujet(): string
    {
        return __('notifications.'.$this->cle().'.subject', ['property' => $this->titreDuBien()]);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject($this->sujet())
            ->greeting(__('notifications.'.$this->cle().'.greeting'))
            ->line(__('notifications.'.$this->cle().'.intro', ['property' => $this->titreDuBien()]))
            ->line(__('notifications.'.$this->cle().'.schedule', ['datetime' => $this->heure()]))
            ->salutation(__('notifications.salutation'));
    }

    public function toSms(object $notifiable): string
    {
        return __('notifications.visit_sms.'.$this->cle(), [
            'property' => $this->titreDuBien(),
            'datetime' => $this->heure(),
        ]);
    }

    public function shouldSendSms(): bool
    {
        return $this->envoieUnSms();
    }

    public function isCriticalSms(): bool
    {
        return false;
    }

    public function smsEventType(): string
    {
        return self::EVENT_TYPE;
    }

    /**
     * @return array{type: NotificationType, title: string, body: string, data: array<string,mixed>}
     */
    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::Visit,
            'title' => $this->sujet(),
            'body' => __('notifications.'.$this->cle().'.schedule', ['datetime' => $this->heure()]),
            'data' => $this->toArray($notifiable),
        ];
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'visit_id' => $this->visit->id,
            'property_id' => $this->visit->property_id,
            'property_title' => $this->visit->property?->title,
            'scheduled_at' => optional($this->visit->scheduled_at)->toIso8601String(),
            'type' => $this->visit->type?->value,
            'title' => $this->sujet(),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }
}
