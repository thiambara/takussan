<?php

namespace App\Notifications;

use App\Models\ThresholdAlert;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-032 P3 — dispatched to agency admins when a metric crosses an alert
 * threshold. Uses the app's standard locale pipeline via HasLocalePreference.
 */
class ThresholdAlertTriggered extends Notification
{
    use Queueable;

    public function __construct(
        public readonly ThresholdAlert $alert,
        public readonly float $value,
    ) {}

    public const EVENT_TYPE = 'threshold_alert';

    /**
     * @return list<string>
     */
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

        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $direction = in_array($this->alert->operator, ['>', '>='], true) ? 'dépasse' : 'est inférieur à';

        return (new MailMessage)
            ->subject('[Takussan] Alerte KPI — '.$this->alert->metric)
            ->line('Une métrique surveillée a franchi son seuil.')
            ->line(sprintf(
                '%s : %.2f %s %.2f (sévérité : %s).',
                $this->alert->metric,
                $this->value,
                $direction,
                (float) $this->alert->threshold,
                $this->alert->severity,
            ))
            ->action('Voir le tableau de bord', url('/app/overview'))
            ->line('Cette alerte ne sera pas renvoyée pendant '.$this->alert->cooldown_hours.' heures.');
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'alert_id' => $this->alert->id,
            'agency_id' => $this->alert->agency_id,
            'metric' => $this->alert->metric,
            'operator' => $this->alert->operator,
            'threshold' => (float) $this->alert->threshold,
            'value' => $this->value,
            'severity' => $this->alert->severity,
        ];
    }
}
