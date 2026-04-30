<?php

namespace App\Notifications\Channels;

use App\Models\User;
use App\Notifications\Concerns\SupportsSms;
use App\Services\Notifications\PreferenceResolver;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Services\Notifications\Sms\SmsRouterDriver;
use Illuminate\Contracts\Config\Repository as ConfigRepository;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;

/**
 * TCK-102 — Laravel notification channel that bridges
 * `$notifiable->notify($n)` onto {@see SmsRouterDriver}.
 *
 * Pre-flight checks (in order):
 *   1. Notification must implement {@see SupportsSms} and return
 *      `shouldSendSms()=true` (covers AC10 — non-critical opt-out).
 *   2. Recipient must have a phone number.
 *   3. User opt-in via PreferenceResolver — bypassed when the
 *      Notification is `isCriticalSms()=true`.
 *   4. Rate limit: 5 SMS / hour / user (configurable). Counted before
 *      any provider is touched (AC13).
 */
class SmsChannel
{
    public function __construct(
        private readonly SmsRouterDriver $router,
        private readonly PreferenceResolver $preferences,
        private readonly ConfigRepository $config,
    ) {}

    public function send(object $notifiable, Notification $notification): mixed
    {
        if (! $notification instanceof SupportsSms) {
            return null;
        }
        if (! $notification->shouldSendSms()) {
            return null;
        }
        $phone = $this->resolvePhone($notifiable, $notification);
        if (! $phone) {
            return null;
        }
        if (! PhoneNumber::isValid($phone)) {
            Log::warning('[sms-channel] invalid phone — rejected before routing', [
                'phone' => $phone,
                'notification' => $notification::class,
            ]);

            return null;
        }
        // AC11 — user has opted out of SMS (proxied via phone
        // verification). Applies to critical notifications too: an
        // unverified phone cannot receive SMS, period.
        if ($notifiable instanceof User && ! $notifiable->phone_verified_at) {
            return null;
        }
        $isCritical = $notification->isCriticalSms();
        if (! $isCritical && ! $this->isOptedIn($notifiable, $notification)) {
            return null;
        }
        if (! $this->withinRateLimit($notifiable, $isCritical)) {
            return null;
        }

        $message = $notification->toSms($notifiable);
        $context = [
            'is_critical' => $isCritical,
            'event_type' => $this->resolveEventType($notification),
            'agency_id' => $this->resolveAgencyId($notifiable),
            'notification_id' => $this->resolveAppNotificationId($notifiable, $notification),
        ];

        return $this->router->send($phone, $message, $context);
    }

    private function resolvePhone(object $notifiable, Notification $notification): ?string
    {
        $routed = method_exists($notifiable, 'routeNotificationFor')
            ? $notifiable->routeNotificationFor('sms', $notification)
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
        return method_exists($notification, 'smsEventType')
            ? (string) $notification->smsEventType()
            : null;
    }

    /**
     * Notifications can opt to attach themselves to an AppNotification
     * row via `appNotificationIdFor($notifiable)`. Returning the id
     * tells the router where to log `delivery_attempts`.
     */
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
        if (! $eventType || ! method_exists($notifiable, 'getKey')) {
            return true;
        }
        if (! $notifiable instanceof User) {
            return true;
        }

        return $this->preferences->shouldSend($notifiable, $eventType, PreferenceResolver::CHANNEL_SMS);
    }

    private function withinRateLimit(object $notifiable, bool $isCritical): bool
    {
        $userId = method_exists($notifiable, 'getKey') ? $notifiable->getKey() : null;
        if (! $userId) {
            return true;
        }
        $key = "sms-channel:user:{$userId}";
        $maxAttempts = (int) $this->config->get('sms.rate_limit.per_user_per_hour', 5);
        if (RateLimiter::tooManyAttempts($key, $maxAttempts)) {
            Log::info('[sms-channel] rate limit hit — skipping', [
                'user_id' => $userId,
                'is_critical' => $isCritical,
            ]);

            return false;
        }
        RateLimiter::hit($key, 3600);

        return true;
    }
}
