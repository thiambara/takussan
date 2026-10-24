<?php

namespace App\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\User;
use App\Models\WhatsappContact;
use App\Notifications\Concerns\AlertsWhenMarkedDeliveryFails;
use App\Notifications\Concerns\SupportsSms;
use App\Notifications\Concerns\SupportsWhatsapp;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Notifications\PreferenceResolver;
use App\Services\Notifications\Sms\SmsOutcome;
use App\Services\Notifications\Sms\SmsTimeBudget;
use App\Services\Notifications\Whatsapp\TemplateResolver;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;
use App\Services\Property\PrimaryPropertyContact;
use App\Support\LienFront;
use App\Support\Logging\SafeExceptionContext;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Log;

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
 *
 * TCK-602 (VERIF-602 M2) — mise en file CHIFFRÉE (`ShouldBeEncrypted`) : ses paramètres portent des
 * données personnelles et, vers un contact sans compte, le lien porteur `/pay/{jeton}`
 * ({@see NotificationCode::bearerParams()}). Sans chiffrement, ils resteraient en clair dans la
 * charge de la file (`jobs`, Redis) et dans `failed_jobs.payload`, que TCK-601 garde intact pour
 * le rejeu.
 */
class CodedNotification extends Notification implements ShouldBeEncrypted, ShouldQueue, SupportsSms, SupportsWhatsapp
{
    use Queueable;

    /**
     * TCK-842 (P27.04) — le job n'est pas tué en cours de chaîne SMS : budget de la chaîne
     * ({@see SmsTimeBudget}), plus un appel WhatsApp qui se replie en SMS, plus une marge ;
     * sous le `retry_after` des files (90 s).
     */
    public $timeout = SmsTimeBudget::CHAIN_SECONDS + 20;

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
        // TCK-1346 (P132.04) — ce qu'un SMS reporté par les heures calmes relit avant de partir
        // ({@see \App\Services\Notifications\Sms\DeferredSmsGuard}).
        public readonly ?array $deferredSmsGuard = null,
        // P207.01 (TCK-2157) — l'objet auquel rattacher l'activité d'exploitation quand tous les
        // fournisseurs refusent le SMS d'un envoi marqué « au plus une fois » (classe et clé, pas
        // le modèle : la copie en file ne doit pas échouer si la ligne disparaît d'ici là).
        public readonly ?array $smsRefusalSubject = null,
    ) {}

    /**
     * TCK-800 (P11.10) — le canal de CETTE copie en file. Laravel met en file une copie par canal,
     * et `failed()` ne reçoit que l'exception : le canal se retient à la mise en file, par
     * {@see middleware()}, que `NotificationSender::queueNotification()` appelle sur chaque copie.
     */
    public ?string $queuedChannel = null;

    /**
     * P207.03 (TCK-2071) — la copie vise un contact sans compte (`AnonymousNotifiable`), retenu à la
     * mise en file comme le canal : `failed()` ne reçoit pas le destinataire.
     */
    public bool $queuedForContact = false;

    /**
     * P179.01 (TCK-2155) — posé par un envoi HORS FILE dont l'appelant relit le sort du SMS
     * ({@see NotificationService::sendToContactNow()}) ; `null` pour tout envoi en file.
     */
    public ?SmsOutcome $smsOutcome = null;

    /**
     * TCK-800 (P11.10) — attendre avant de réessayer : sans délai, le worker (`--tries=3`)
     * épuisait ses trois essais en quelques secondes sur une panne brève du transport.
     *
     * @return list<int>
     */
    public function backoff(): array
    {
        return [60, 300, 900];
    }

    /** @return list<object> */
    public function middleware(object $notifiable, string $channel): array
    {
        $this->queuedChannel = $channel;
        $this->queuedForContact = $notifiable instanceof AnonymousNotifiable;

        return [];
    }

    /**
     * TCK-800 (P11.10) — l'échec final se journalise : le code, le canal, la ligne de la cloche. Ni
     * les paramètres ni le message de l'exception, qui peuvent porter des données personnelles.
     *
     * P207.03 (TCK-2071) — vers un contact sans compte, l'activité alertable `ops_critical_job_failed`
     * s'écrit en plus, comme pour les envois marqués hors code ({@see AlertsWhenMarkedDeliveryFails},
     * TCK-1794) : aucune cloche ne lui reste, et l'appelant (relance de loyer, rappel de visite) a
     * déjà posé sa marque « envoyé ». Mêmes clés que le journal, sans la ligne de cloche qu'un contact n'a pas (ADR-0044
     * § 2). La marque n'est pas touchée, et rien n'est renvoyé.
     */
    public function failed(?\Throwable $e): void
    {
        $context = $e !== null ? SafeExceptionContext::of($e) : [];

        Log::error('[notifications] envoi abandonné', [
            'code' => $this->code->value,
            'channel' => $this->queuedChannel,
            'app_notification_id' => $this->appNotificationId,
            'exception' => $context['exception'] ?? null,
            'at' => $context['at'] ?? null,
        ]);

        if ($this->queuedForContact) {
            activity('Ops')
                ->event('ops_critical_job_failed')
                ->withProperties([
                    'job' => class_basename(static::class),
                    'code' => $this->code->value,
                    'channel' => $this->queuedChannel,
                    'exception' => $context['exception'] ?? null,
                    'at' => $context['at'] ?? null,
                ])
                ->log('ops_critical_job_failed');
        }
    }

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
        // TCK-1350 (P88.04) — même règle que `NotificationService::send()`, pour un envoi direct.
        if (! PrimaryPropertyContact::joignable($notifiable) && ! $this->code->reachesUnreachableAccount()) {
            return [];
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
        if (! $optedIn && $this->smsOutcome !== null) {
            $this->smsOutcome->smsChosen = true;
        }

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
            $mail->action(__('notifications.open'), LienFront::base().$path);
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
     * Les variables du gabarit Meta : TCK-1348 (P132.03) — celles que nomme `meta_variables` de la
     * ligne approuvée, dans cet ordre ; un paramètre absent vaut `—`, comme au rendu. Sans ligne ni
     * noms, l'ordre de {@see NotificationCode::params()} puis `optionalParams()`.
     *
     * @return list<string>
     */
    public function whatsappTemplateParams(object $notifiable): array
    {
        $formatted = app(NotificationRenderer::class)->format(
            $this->code,
            $this->params,
            app()->getLocale(),
            $notifiable instanceof User && $notifiable->timezone ? $notifiable->timezone : NotificationRenderer::DEFAULT_TIMEZONE,
        );
        $names = app(TemplateResolver::class)->approved($this->whatsappTemplateEvent(), app()->getLocale())?->metaVariables() ?? [];
        if ($names === []) {
            return array_values($formatted);
        }

        return array_map(fn (string $name): string => $formatted[$name] ?? '—', array_values($names));
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
