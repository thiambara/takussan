<?php

namespace App\Notifications;

use App\Models\Enums\NotificationType;
use App\Models\ThresholdAlert;
use App\Models\User;
use App\Notifications\Channels\AppDatabaseChannel;
use App\Notifications\Channels\WhatsappChannel;
use App\Notifications\Concerns\SupportsWhatsapp;
use App\Services\Formatting\CurrencyFormatter;
use App\Services\Notifications\PreferenceResolver;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;
use App\Support\LienFront;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Lang;

/**
 * TCK-032 P3 — dispatched to agency admins when a metric crosses an alert
 * threshold. Uses the app's standard locale pipeline via HasLocalePreference.
 *
 * TCK-2866 — le canal est celui de l'ALERTE (`channel` : `email`, `whatsapp`, `both`), et c'est un
 * plafond, pas une contrainte : chacun ne reçoit que ce que ses préférences laissent passer. La cloche
 * part toujours. WhatsApp passe par le canal sortant ({@see WhatsappChannel}) et ses gardes : numéro
 * vérifié, préférence `threshold_alert` / `whatsapp` cochée (désactivée par défaut), contact non
 * désinscrit, limite de débit ; hors fenêtre de service, un gabarit Meta APPROUVÉ pour l'événement
 * `threshold_alert` est exigé (registre `notification_templates`). Sans gabarit, rien ne part sur
 * WhatsApp, et pas de repli SMS : l'admin a choisi WhatsApp, pas le SMS.
 */
class ThresholdAlertTriggered extends Notification implements SupportsWhatsapp
{
    use Queueable;

    public function __construct(
        public readonly ThresholdAlert $alert,
        public readonly float $value,
    ) {}

    public const EVENT_TYPE = 'threshold_alert';

    /**
     * TCK-2627 — les canaux de l'événement, ceux que {@see self::via()} peut retenir selon les
     * préférences de chacun. La lecture d'une alerte les rend tels quels.
     *
     * TCK-2866 — ceux d'une alerte : {@see self::channelsOf()}.
     *
     * @var list<string>
     */
    public const CHANNELS = [PreferenceResolver::CHANNEL_INAPP, PreferenceResolver::CHANNEL_EMAIL];

    /**
     * TCK-2866 — les canaux qu'une alerte peut prendre, selon son `channel` : la cloche toujours, puis le
     * courriel et/ou WhatsApp. La lecture de l'alerte les rend tels quels.
     *
     * @return list<string>
     */
    public static function channelsOf(ThresholdAlert $alert): array
    {
        return array_values(array_filter([
            PreferenceResolver::CHANNEL_INAPP,
            $alert->sendsEmail() ? PreferenceResolver::CHANNEL_EMAIL : null,
            $alert->sendsWhatsapp() ? PreferenceResolver::CHANNEL_WHATSAPP : null,
        ]));
    }

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
        if ($this->alert->sendsEmail()
            && $resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_EMAIL)) {
            $channels[] = 'mail';
        }
        // TCK-2866 — WhatsApp sous la préférence du destinataire ; le canal juge le reste (consentement,
        // numéro vérifié, fenêtre, gabarit).
        if ($this->alert->sendsWhatsapp()
            && $notifiable instanceof User
            && $resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_WHATSAPP)) {
            $channels[] = 'whatsapp';
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
                // TCK-2794 — groupés comme tout nombre rendu (U+00A0), et non par l'U+202F d'ICU.
                'value' => CurrencyFormatter::nombre($this->value, $locale, 2, 2),
                'threshold' => CurrencyFormatter::nombre((float) $this->alert->threshold, $locale, 2, 2),
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
            // P164.03 (TCK-1466) — le titre est rangé tel quel et la cloche le lit tel quel :
            // la métrique y est nommée par le libellé du courriel (P155.04), plus par son code.
            'title' => __('notifications.threshold_alert.title', [
                'metric' => self::libelle('notifications.threshold_alert_mail.metrics', (string) $this->alert->metric),
            ]),
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

    /** TCK-2866 — le texte libre (fenêtre de service ouverte) : le titre de la cloche et la ligne du courriel. */
    public function toWhatsapp(object $notifiable): string
    {
        return $this->titre()."\n".$this->ligne(app()->getLocale());
    }

    /** Hors fenêtre : le gabarit approuvé de l'événement `threshold_alert`, cherché par le canal. */
    public function whatsappTemplate(object $notifiable): ?WhatsappTemplateRef
    {
        return null;
    }

    public function shouldSendWhatsapp(): bool
    {
        return $this->alert->sendsWhatsapp();
    }

    public function isCriticalWhatsapp(): bool
    {
        return false;
    }

    public function whatsappEventType(): string
    {
        return self::EVENT_TYPE;
    }

    /**
     * Les paramètres du gabarit : la mesure nommée, la valeur et le seuil, groupés.
     *
     * @return list<string>
     */
    public function whatsappTemplateParams(object $notifiable): array
    {
        $locale = app()->getLocale();

        return [
            self::libelle('notifications.threshold_alert_mail.metrics', (string) $this->alert->metric),
            CurrencyFormatter::nombre($this->value, $locale, 2, 2),
            CurrencyFormatter::nombre((float) $this->alert->threshold, $locale, 2, 2),
        ];
    }

    /** TCK-2866 — pas de repli SMS : l'admin a choisi WhatsApp, et le SMS a un coût. */
    public function smsFallbackAllowed(): bool
    {
        return false;
    }

    private function titre(): string
    {
        return (string) __('notifications.threshold_alert.title', [
            'metric' => self::libelle('notifications.threshold_alert_mail.metrics', (string) $this->alert->metric),
        ]);
    }

    private function ligne(string $locale): string
    {
        $direction = in_array($this->alert->operator, ['>', '>='], true) ? 'above' : 'below';

        return (string) __('notifications.threshold_alert_mail.'.$direction, [
            'metric' => self::libelle('notifications.threshold_alert_mail.metrics', (string) $this->alert->metric),
            'value' => CurrencyFormatter::nombre($this->value, $locale, 2, 2),
            'threshold' => CurrencyFormatter::nombre((float) $this->alert->threshold, $locale, 2, 2),
            'severity' => self::libelle('notifications.threshold_alert_mail.severities', (string) $this->alert->severity),
        ]);
    }
}
