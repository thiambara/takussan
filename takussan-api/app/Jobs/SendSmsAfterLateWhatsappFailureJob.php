<?php

namespace App\Jobs;

use App\Domain\Notifications\NotificationCode;
use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use App\Notifications\CodedNotification;
use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use App\Services\Notifications\Sms\QuietHoursGuard;
use App\Services\Notifications\Sms\SmsRouterDriver;
use App\Services\Notifications\Whatsapp\WhatsappResult;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Traits\Localizable;

/**
 * P72.01 (TCK-1092) — le repli SMS d'un message WhatsApp que Meta a accepté, puis dit `failed` par
 * son accusé. `WhatsappChannel` ne se replie que sur l'échec rendu par l'appel (TCK-766 : jamais sur
 * un ambigu) ; un `failed` de Meta est un échec sûr, mais il n'arrive qu'après.
 *
 * Mis en file par {@see UpdateWhatsappDeliveryStatusJob} au seul PASSAGE de la tentative à `failed`
 * ({@see DeliveryAttemptUpdater}) : un accusé rejoué ne repasse pas.
 * Le SMS ne part que :
 *  - pour une tentative rattachée à une notification par code (les seules qui portent une ligne
 *    `app_notifications`, {@see CodedNotification::appNotificationIdFor()}) ;
 *  - si aucune tentative SMS n'est déjà écrite pour cette notification ;
 *  - si la notification permet le repli (`smsFallbackAllowed()`, TCK-599) ;
 *  - hors des heures calmes ARTP : il n'est pas reporté au matin, il ne part pas ;
 *  - si l'accusé est arrivé moins d'une heure après l'envoi : au-delà, le message n'a plus d'objet.
 *
 * Le texte est celui du SMS de la notification, rendu depuis sa ligne (code et paramètres) dans la
 * langue du destinataire, comme {@see CodedNotification::toSms()}.
 *
 * Chiffré (`ShouldBeEncrypted`) comme tout job qui remet un SMS au pilote (TCK-678,
 * `JobSmsChiffreTest`) : il ne porte que des identifiants, mais la règle ne distingue pas.
 */
class SendSmsAfterLateWhatsappFailureJob implements ShouldBeEncrypted, ShouldQueue
{
    use Localizable;
    use Queueable;

    public const MAX_DELAY_SECONDS = 3600;

    public function __construct(
        public readonly int $attemptId,
        public readonly int $receivedAt,
    ) {}

    public function handle(SmsRouterDriver $smsRouter, QuietHoursGuard $quietHours): void
    {
        $attempt = NotificationDeliveryAttempt::query()->find($this->attemptId);
        if (! $attempt
            || $attempt->provider !== 'whatsapp_cloud'
            || $attempt->status !== WhatsappResult::STATUS_FAILED
            || ! $attempt->app_notification_id
            || ! is_string($attempt->to) || $attempt->to === ''
        ) {
            return;
        }

        $sentAt = $attempt->sent_at ?? $attempt->created_at;
        if ($sentAt === null || $this->receivedAt - $sentAt->getTimestamp() > self::MAX_DELAY_SECONDS) {
            return;
        }
        if ($quietHours->isQuietNow(CarbonImmutable::now())) {
            return;
        }

        $alreadySms = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $attempt->app_notification_id)
            ->where('provider', 'not like', 'whatsapp%')
            ->exists();
        if ($alreadySms) {
            return;
        }

        $row = AppNotification::query()->with('user')->find($attempt->app_notification_id);
        $code = $row?->code ? NotificationCode::tryFrom($row->code) : null;
        if (! $row || ! $row->user || ! $code) {
            return;
        }

        $notification = new CodedNotification($code, (array) $row->params, $row->target, $row->id);
        if (method_exists($notification, 'smsFallbackAllowed') && ! $notification->smsFallbackAllowed()) {
            return;
        }

        $user = $row->user;
        $locale = $user->preferredLocale() ?? (string) config('app.locale');
        $body = $this->withLocale($locale, fn (): string => $notification->toSms($user));

        Log::info('[whatsapp] repli SMS après un accusé failed', [
            'attempt_id' => $attempt->id,
            'app_notification_id' => $row->id,
        ]);

        $smsRouter->send($attempt->to, $body, [
            'is_critical' => false,
            'event_type' => $notification->smsEventType(),
            // Même agence que `WhatsappChannel::resolveAgencyId()` : l'intégration SMS se choisit par elle.
            'agency_id' => $user->agency_id,
            'notification_id' => $row->id,
        ]);
    }
}
