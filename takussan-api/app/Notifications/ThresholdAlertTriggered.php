<?php

namespace App\Notifications;

use App\Models\Enums\NotificationType;
use App\Models\ThresholdAlert;
use App\Notifications\Channels\AppDatabaseChannel;
use App\Services\Notifications\PreferenceResolver;
use App\Support\LienFront;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Lang;
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
        // P97.01 (TCK-1122) — le tableau de bord est une page du FRONT. `url()` prenait, depuis
        // la commande planifiée hors requête, `APP_URL` : l'hôte de l'API, qui n'en sert aucune.
        $frontend = LienFront::base();

        // P155.04 (TCK-1439) — la métrique et la sévérité nommées, plus leurs codes.
        $metric = self::libelle('notifications.threshold_alert_mail.metrics', (string) $this->alert->metric);

        return (new MailMessage)
            // P155.05 (TCK-1441) — les formules du dépôt, plus celles du gabarit de Laravel.
            ->greeting(__('notifications.greeting'))
            ->subject(__('notifications.threshold_alert_mail.subject', ['metric' => $metric]))
            ->line(__('notifications.threshold_alert_mail.intro'))
            ->line(__('notifications.threshold_alert_mail.'.$direction, [
                'metric' => $metric,
                'value' => Number::format($this->value, precision: 2, locale: $locale),
                'threshold' => Number::format((float) $this->alert->threshold, precision: 2, locale: $locale),
                'severity' => self::libelle('notifications.threshold_alert_mail.severities', (string) $this->alert->severity),
            ]))
            ->action(__('notifications.threshold_alert_mail.action'), $frontend.'/app/overview')
            ->line(trans_choice('notifications.threshold_alert_mail.cooldown', (int) $this->alert->cooldown_hours, [
                'hours' => (int) $this->alert->cooldown_hours,
            ]))
            ->salutation(__('notifications.salutation'));
    }

    /** Le libellé d'un code, ou le code lui-même s'il n'en a pas (une valeur d'avant la liste). */
    private static function libelle(string $groupe, string $code): string
    {
        return Lang::has($groupe.'.'.$code) ? (string) __($groupe.'.'.$code) : $code;
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
