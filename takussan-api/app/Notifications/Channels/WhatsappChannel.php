<?php

namespace App\Notifications\Channels;

use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Models\WhatsappContact;
use App\Notifications\Concerns\SupportsSms;
use App\Notifications\Concerns\SupportsWhatsapp;
use App\Services\Notifications\PreferenceResolver;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Services\Notifications\Sms\SmsRouterDriver;
use App\Services\Notifications\Whatsapp\ServiceWindow;
use App\Services\Notifications\Whatsapp\TemplateResolver;
use App\Services\Notifications\Whatsapp\WhatsappDriverInterface;
use App\Services\Notifications\Whatsapp\WhatsappMessage;
use App\Services\Notifications\Whatsapp\WhatsappResult;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;
use Illuminate\Contracts\Config\Repository as ConfigRepository;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;

/**
 * TCK-282 — Laravel notification channel that bridges
 * `$notifiable->notify($n)` onto the WhatsApp Cloud API, with an automatic
 * cross-channel fallback to SMS. Mirror of {@see SmsChannel}, mono-provider.
 *
 * Pre-flight checks (return null = no mobile send at all):
 *   1. Notification implements {@see SupportsWhatsapp} & `shouldSendWhatsapp()`.
 *   2. Recipient has a valid phone.
 *   3. Gate `phone_verified_at` (applies to critical too).
 *   4. Opt-in via PreferenceResolver (`whatsapp`) — bypassed when critical.
 *   5. Rate limit `whatsapp-channel:user:{id}` — bypassed when critical (AC7).
 *
 * Routing then decides the message form:
 *   - contact opted-out          → ineligible → SMS fallback (AC4)
 *   - service window open         → free-form text             (AC1)
 *   - window closed + template    → approved template           (AC2)
 *   - window closed, no template  → ineligible → SMS fallback
 *
 * A hard WhatsApp failure also rolls over to SMS (AC3). Exactly one mobile
 * channel is delivered; the SMS opt-in is NOT re-checked on fallback (the
 * user already consented to a mobile message for this event) — only the
 * `phone_verified_at` gate, already passed above, stands.
 */
class WhatsappChannel
{
    public function __construct(
        private readonly WhatsappDriverInterface $driver,
        private readonly SmsRouterDriver $smsRouter,
        private readonly PreferenceResolver $preferences,
        private readonly ServiceWindow $serviceWindow,
        private readonly TemplateResolver $templates,
        private readonly ConfigRepository $config,
    ) {}

    public function send(object $notifiable, Notification $notification): mixed
    {
        if (! $notification instanceof SupportsWhatsapp || ! $notification->shouldSendWhatsapp()) {
            return null;
        }
        $phone = $this->resolvePhone($notifiable, $notification);
        if (! $phone) {
            return null;
        }
        if (! PhoneNumber::isValid($phone)) {
            Log::warning('[whatsapp-channel] invalid phone — rejected', [
                'phone' => $phone,
                'notification' => $notification::class,
            ]);

            return null;
        }
        // Gate: an unverified phone can never receive a mobile message —
        // applies to critical notifications too.
        if ($notifiable instanceof User && ! $notifiable->phone_verified_at) {
            return null;
        }

        $isCritical = $notification->isCriticalWhatsapp();
        if (! $isCritical && ! $this->isOptedIn($notifiable, $notification)) {
            return null;
        }
        if (! $isCritical && ! $this->withinRateLimit($notifiable)) {
            return null;
        }

        $context = [
            'is_critical' => $isCritical,
            'event_type' => $this->resolveEventType($notification),
            'agency_id' => $this->resolveAgencyId($notifiable),
            'notification_id' => $this->resolveAppNotificationId($notifiable, $notification),
        ];

        // Resolve the message form against the service window + consent.
        $contact = $this->resolveContact($phone);
        $message = $this->resolveMessage($notifiable, $notification, $contact, $context['event_type']);

        if ($message === null) {
            // WhatsApp ineligible (opted-out, or out-of-window without an
            // approved template) — record a deferred attempt then roll to SMS
            // without touching the provider.
            $deferred = WhatsappResult::deferred($phone, $this->driver->id(), $this->ineligibilityReason($contact));
            $this->logAttempt($context['notification_id'], 1, $deferred);

            return $this->fallbackToSms($notifiable, $notification, $phone, $context, $deferred);
        }

        $results = $this->driver->send($phone, $message, $context);
        $result = $results[$phone] ?? WhatsappResult::failed($phone, $this->driver->id(), 'whatsapp_no_result');
        $this->logAttempt($context['notification_id'], 1, $result);

        if ($result->isTerminalSuccess()) {
            return $results;
        }

        return $this->fallbackToSms($notifiable, $notification, $phone, $context, $result);
    }

    /**
     * Decide the WhatsApp message to send, or null when WhatsApp is not a
     * viable channel for this recipient right now (→ SMS fallback).
     */
    private function resolveMessage(
        object $notifiable,
        Notification $notification,
        ?WhatsappContact $contact,
        ?string $eventType,
    ): ?WhatsappMessage {
        if ($contact && $contact->isOptedOut()) {
            return null;
        }
        if ($this->serviceWindow->isOpen($contact)) {
            return WhatsappMessage::text($notification->toWhatsapp($notifiable));
        }
        // Outside the window: an approved template is mandatory (Meta).
        $template = $this->resolveTemplateRef($notifiable, $notification, $eventType);

        return $template ? WhatsappMessage::template($template) : null;
    }

    /**
     * TCK-283 — Resolve the approved Meta template to use outside the
     * service window. A notification may carry its own self-contained
     * {@see WhatsappTemplateRef}; otherwise the registry is consulted for an
     * approved `event + locale` row. Null → no approved template → SMS
     * fallback.
     */
    private function resolveTemplateRef(
        object $notifiable,
        Notification $notification,
        ?string $eventType,
    ): ?WhatsappTemplateRef {
        $ref = $notification->whatsappTemplate($notifiable);
        if ($ref !== null) {
            return $ref;
        }
        if (! $eventType) {
            return null;
        }
        $params = method_exists($notification, 'whatsappTemplateParams')
            ? (array) $notification->whatsappTemplateParams($notifiable)
            : [];

        return $this->templates->resolve($eventType, app()->getLocale(), array_values($params));
    }

    private function ineligibilityReason(?WhatsappContact $contact): string
    {
        if ($contact && $contact->isOptedOut()) {
            return 'contact_opted_out';
        }

        return 'outside_window_no_template';
    }

    /**
     * Cross-channel fallback: re-dispatch through the SMS router with the
     * same delivery context. The SMS router records its own attempts.
     *
     * @param  array<string,mixed>  $context
     * @return array<string,mixed>
     */
    private function fallbackToSms(
        object $notifiable,
        Notification $notification,
        string $phone,
        array $context,
        WhatsappResult $whatsappResult,
    ): array {
        $body = $notification instanceof SupportsSms
            ? $notification->toSms($notifiable)
            : $notification->toWhatsapp($notifiable);

        $smsResults = $this->smsRouter->send($phone, $body, $context);

        return [
            'whatsapp' => $whatsappResult,
            'sms' => $smsResults,
        ];
    }

    private function resolveContact(string $phone): ?WhatsappContact
    {
        try {
            $normalized = PhoneNumber::normalize($phone);
        } catch (\InvalidArgumentException) {
            return null;
        }

        return WhatsappContact::query()->where('phone', $normalized)->first();
    }

    private function resolvePhone(object $notifiable, Notification $notification): ?string
    {
        $routed = method_exists($notifiable, 'routeNotificationFor')
            ? $notifiable->routeNotificationFor('whatsapp', $notification)
            : null;
        if (is_string($routed) && $routed !== '') {
            return $routed;
        }

        return is_string($notifiable->phone ?? null) ? $notifiable->phone : null;
    }

    private function resolveAgencyId(object $notifiable): ?int
    {
        $val = $notifiable->agency_id ?? null;

        return is_int($val) ? $val : (ctype_digit((string) $val) ? (int) $val : null);
    }

    private function resolveEventType(Notification $notification): ?string
    {
        if (method_exists($notification, 'whatsappEventType')) {
            return (string) $notification->whatsappEventType();
        }
        if (method_exists($notification, 'smsEventType')) {
            return (string) $notification->smsEventType();
        }

        return null;
    }

    private function resolveAppNotificationId(object $notifiable, Notification $notification): ?int
    {
        if (! method_exists($notification, 'appNotificationIdFor')) {
            return null;
        }
        $id = $notification->appNotificationIdFor($notifiable);

        return is_int($id) ? $id : null;
    }

    private function isOptedIn(object $notifiable, Notification $notification): bool
    {
        $eventType = $this->resolveEventType($notification);
        if (! $eventType || ! $notifiable instanceof User) {
            return true;
        }

        return $this->preferences->shouldSend($notifiable, $eventType, PreferenceResolver::CHANNEL_WHATSAPP);
    }

    private function withinRateLimit(object $notifiable): bool
    {
        $userId = method_exists($notifiable, 'getKey') ? $notifiable->getKey() : null;
        if (! $userId) {
            return true;
        }
        $key = "whatsapp-channel:user:{$userId}";
        $maxAttempts = (int) $this->config->get('whatsapp.rate_limit.per_user_per_hour', 10);
        if (RateLimiter::tooManyAttempts($key, $maxAttempts)) {
            Log::info('[whatsapp-channel] rate limit hit — skipping', ['user_id' => $userId]);

            return false;
        }
        RateLimiter::hit($key, 3600);

        return true;
    }

    private function logAttempt(?int $notificationId, int $attempt, WhatsappResult $result): void
    {
        if (! $notificationId) {
            return;
        }
        try {
            DB::transaction(function () use ($notificationId, $attempt, $result): void {
                $notification = AppNotification::query()->lockForUpdate()->findOrFail($notificationId);
                NotificationDeliveryAttempt::query()->create([
                    'app_notification_id' => $notification->id,
                    'attempt' => $attempt,
                    'provider' => $result->provider,
                    'provider_message_id' => $result->providerMessageId,
                    'to' => $result->to,
                    'status' => $result->status,
                    'failure_reason' => $result->failureReason,
                    'sent_at' => $result->sentAt,
                    'delivered_at' => $result->deliveredAt,
                ]);
            });
        } catch (ModelNotFoundException) {
            // Notification row vanished mid-flight — nothing to attach to.
        }
    }
}
