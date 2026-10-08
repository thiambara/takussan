<?php

namespace App\Notifications;

use App\Models\Enums\NotificationType;
use App\Models\ThresholdAlert;
use App\Notifications\Channels\AppDatabaseChannel;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Number;

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
        $direction = in_array($this->alert->operator, ['>', '>='], true) ? 'above' : 'below';
        $locale = app()->getLocale();

        return (new MailMessage)
            ->subject(__('notifications.threshold_alert_mail.subject', ['metric' => $this->alert->metric]))
            ->line(__('notifications.threshold_alert_mail.intro'))
            ->line(__('notifications.threshold_alert_mail.'.$direction, [
                'metric' => $this->alert->metric,
                'value' => Number::format($this->value, precision: 2, locale: $locale),
                'threshold' => Number::format((float) $this->alert->threshold, precision: 2, locale: $locale),
                'severity' => $this->alert->severity,
            ]))
            ->action(__('notifications.threshold_alert_mail.action'), url('/app/overview'))
            ->line(trans_choice('notifications.threshold_alert_mail.cooldown', (int) $this->alert->cooldown_hours, [
                'hours' => (int) $this->alert->cooldown_hours,
            ]));
    }

    /**
     * Le feed in-app (`app_notifications`) exige un `type` et un `title` ; le
     * `toArray()` de cette classe n'en porte pas. On les déclare donc ici plutôt que
     * de les laisser deviner — {@see AppDatabaseChannel}.
     *
     * @return array{type: NotificationType, title: string, data: array<string,mixed>}
     */
    public function toAppNotification(object $notifiable): array
    {
        return [
            'type' => NotificationType::System,
            'title' => __('notifications.threshold_alert.title', ['metric' => $this->alert->metric]),
            'data' => $this->toArray($notifiable),
        ];
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
