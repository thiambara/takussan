<?php

namespace App\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\User;
use App\Models\WhatsappContact;
use App\Notifications\Concerns\SupportsSms;
use App\Notifications\Concerns\SupportsWhatsapp;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Notifications\PreferenceResolver;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-588 (ADR-0032) — l'envoi hors cloche d'une notification par code : e-mail, broadcast et
 * UN canal mobile, chacun rendu dans la langue du destinataire.
 *
 * La ligne `app_notifications` n'en fait pas partie : {@see NotificationService::send()} l'écrit
 * en synchrone avant de mettre ceci en file, et passe son identifiant pour que les canaux
 * mobiles y rattachent leurs tentatives de livraison.
 *
 * La langue n'est jamais lue ici : `NotificationSender` exécute chaque canal sous
 * `withLocale()` — la langue préférée du `User`, ou celle que `->locale()` fixe pour un contact
 * sans compte. `app()->getLocale()` EST donc la langue du destinataire dans chaque `to*()`.
 */
class CodedNotification extends Notification implements ShouldQueue, SupportsSms, SupportsWhatsapp
{
    use Queueable;

    /**
     * @param  array<string, mixed>  $params  paramètres bruts
     * @param  array{kind: string, id: ?int, path: string}|null  $target
     */
    public function __construct(
        public readonly NotificationCode $code,
        public readonly array $params,
        public readonly ?array $target = null,
        public readonly ?int $appNotificationId = null,
        // TCK-590 — cf. {@see NotificationService::send()} : null, règles du code ; true, borné en
        // amont (les canaux ne recomptent pas) ; false, aucun canal mobile.
        public readonly ?bool $mobileBorne = null,
    ) {}

    /** Le SMS a été borné au point d'envoi : les canaux mobiles ne le recomptent pas. */
    public function mobileDejaBorne(): bool
    {
        return $this->mobileBorne === true;
    }

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        if (! $notifiable instanceof User) {
            return $this->contactChannels($notifiable);
        }

        $resolver = app(PreferenceResolver::class);
        $event = $this->code->preferenceEvent();
        $channels = [];

        if ($notifiable->email && ($event === null || $resolver->shouldSend($notifiable, $event, PreferenceResolver::CHANNEL_EMAIL))) {
            $channels[] = 'mail';
        }
        if (
            $event !== null
            && in_array(PreferenceResolver::CHANNEL_PUSH, $resolver->channelsFor($event), true)
            && $resolver->shouldSend($notifiable, $event, PreferenceResolver::CHANNEL_PUSH)
        ) {
            $channels[] = 'broadcast';
        }
        // Un seul canal mobile — WhatsApp s'il est permis, sinon SMS (TCK-282, AC5).
        if ($this->code->mobile() && $event !== null && $this->mobileBorne !== false) {
            $mobile = $resolver->resolveMobileChannel($notifiable, $event);
            if ($mobile !== null) {
                $channels[] = $mobile;
            }
        }

        return $channels;
    }

    /**
     * Un contact sans compte : WhatsApp seulement s'il y a consenti (`opted_in`), sinon SMS.
     *
     * TCK-590 — et l'e-mail qu'il a laissé. Le canal mobile ne part que pour un code mobile (un
     * accusé de réception ne fait pas partir de SMS), et jamais quand l'appelant l'a retenu.
     *
     * @return list<string>
     */
    private function contactChannels(object $notifiable): array
    {
        if (! $notifiable instanceof AnonymousNotifiable) {
            return [];
        }

        $channels = [];
        $mail = $notifiable->routes['mail'] ?? null;
        if (is_string($mail) && $mail !== '') {
            $channels[] = 'mail';
        }

        $phone = $notifiable->routes['sms'] ?? null;
        if (! $this->code->mobile() || $this->mobileBorne === false || ! is_string($phone) || $phone === '') {
            return $channels;
        }

        $optedIn = WhatsappContact::query()
            ->where('phone', $phone)
            ->where('opt_in_status', WhatsappContact::OPT_IN_OPTED_IN)
            ->exists();
        $channels[] = $optedIn ? 'whatsapp' : 'sms';

        return $channels;
    }

    private function render(object $notifiable, string $surface): string
    {
        return app(NotificationRenderer::class)->render(
            $this->code,
            $this->params,
            app()->getLocale(),
            $notifiable instanceof User ? $notifiable->timezone : null,
            $surface,
            $notifiable instanceof User ? $notifiable->first_name : null,
        );
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->subject($this->render($notifiable, 'mail_subject'))
            ->greeting(__('notifications.greeting'));

        foreach (preg_split('/\R/', $this->render($notifiable, 'mail_body')) ?: [] as $line) {
            $mail->line($line);
        }

        $path = $this->target['path'] ?? null;
        if (is_string($path) && $path !== '') {
            $mail->action(__('notifications.open'), rtrim((string) config('app.frontend_url'), '/').$path);
        }

        return $mail->salutation(__('notifications.salutation'));
    }

    public function toSms(object $notifiable): string
    {
        return $this->render($notifiable, 'sms');
    }

    public function shouldSendSms(): bool
    {
        return true;
    }

    public function isCriticalSms(): bool
    {
        return false;
    }

    public function toWhatsapp(object $notifiable): string
    {
        return $this->render($notifiable, 'sms');
    }

    /** Hors fenêtre de 24 h, le registre est consulté par {@see whatsappTemplateEvent()}. */
    public function whatsappTemplate(object $notifiable): ?WhatsappTemplateRef
    {
        return null;
    }

    public function shouldSendWhatsapp(): bool
    {
        return true;
    }

    public function isCriticalWhatsapp(): bool
    {
        return false;
    }

    /** L'interrupteur de préférence, que les canaux mobiles relisent. */
    public function smsEventType(): string
    {
        return $this->code->preferenceEvent() ?? $this->code->value;
    }

    public function whatsappEventType(): string
    {
        return $this->smsEventType();
    }

    /** L'événement des lignes `notification_templates` (canal `whatsapp`) : le code lui-même. */
    public function whatsappTemplateEvent(): string
    {
        return $this->code->value;
    }

    /**
     * Les variables du gabarit Meta, dans l'ordre de {@see NotificationCode::params()}.
     *
     * @return list<string>
     */
    public function whatsappTemplateParams(object $notifiable): array
    {
        return array_values(app(NotificationRenderer::class)->format(
            $this->code,
            $this->params,
            app()->getLocale(),
            $notifiable instanceof User && $notifiable->timezone ? $notifiable->timezone : NotificationRenderer::DEFAULT_TIMEZONE,
        ));
    }

    public function appNotificationIdFor(object $notifiable): ?int
    {
        return $this->appNotificationId;
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage([
            'id' => $this->appNotificationId,
            'code' => $this->code->value,
            'params' => $this->params,
            'target' => $this->target,
            'title' => $this->render($notifiable, 'title'),
            'body' => $this->render($notifiable, 'body'),
        ]);
    }

    public function broadcastType(): string
    {
        return $this->code->value;
    }
}
