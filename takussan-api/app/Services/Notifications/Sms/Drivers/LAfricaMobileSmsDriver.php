<?php

namespace App\Services\Notifications\Sms\Drivers;

use App\Services\Notifications\Sms\IntegrationLocator;
use App\Services\Notifications\Sms\OperatorResolver;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Services\Notifications\Sms\SmsDriverInterface;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsSegmentCalculator;
use Illuminate\Contracts\Config\Repository as ConfigRepository;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\URL;

/**
 * TCK-102 — LAfricaMobile (LAMPUSH v2.3) driver.
 *
 * Endpoint: POST {send_url} (JSON for single recipient, XML for
 * multi-recipient). For simplicity we loop in JSON mode — LAM bills
 * the same and the operational overhead of XML batching is not worth
 * the complexity at the volume targeted by the v1 router.
 *
 * Auth   : `accountid` / `password` in the body.
 * Sender : ≤ 11 alphanum, MUST NOT start with a digit.
 * DLR    : per-message `ret_url` — we generate a signed Laravel route
 *          embedding the AppNotification id so the inbound GET callback
 *          can match the attempt.
 */
class LAfricaMobileSmsDriver implements SmsDriverInterface
{
    public function __construct(
        private readonly HttpFactory $http,
        private readonly ConfigRepository $config,
        private readonly IntegrationLocator $integrations,
        private readonly OperatorResolver $operators,
    ) {}

    public function id(): string
    {
        return 'lafricamobile';
    }

    public function send(array|string $to, string $message, array $context = []): array
    {
        $recipients = array_values(array_unique(array_map(
            fn (string $n) => PhoneNumber::normalize($n),
            is_array($to) ? $to : [$to],
        )));
        $integration = $this->integrations->find($context['agency_id'] ?? null, 'sms_lafricamobile');
        if ($integration === null) {
            return $this->failAll($recipients, 'lam_integration_missing');
        }
        $creds = $integration->credentials ?? [];
        $url = $this->resolveSendUrl($creds, $integration->metadata ?? []);
        $senderId = (string) ($context['sender_id']
            ?? $integration->metadata['sender_id']
            ?? $creds['sender_id']
            ?? 'Takussan');
        if (preg_match('/^\d/', $senderId)) {
            return $this->failAll($recipients, 'lam_sender_must_not_start_with_digit');
        }
        $segments = SmsSegmentCalculator::segmentsCount($message);
        $notificationId = $context['notification_id'] ?? null;

        $results = [];
        foreach ($recipients as $recipient) {
            $payload = [
                'accountid' => $creds['accountid'] ?? '',
                'password' => $creds['password'] ?? '',
                'sender' => $senderId,
                'to' => ltrim($recipient, '+'),
                'text' => $message,
            ];
            if ($notificationId) {
                $payload['ret_url'] = $this->buildReturnUrl((int) $notificationId);
            }
            try {
                $response = $this->http
                    ->timeout(10)
                    ->acceptJson()
                    ->post($url, $payload);
            } catch (\Throwable $e) {
                Log::warning('[sms.lam] HTTP exception', ['error' => $e->getMessage()]);
                $results[$recipient] = SmsResult::failed($recipient, $this->id(), 'lam_http_exception');

                continue;
            }
            $body = $response->json() ?? [];
            $pushId = (string) ($body['push_id'] ?? $body['pushId'] ?? '');
            if ($response->successful() && $pushId !== '') {
                $destination = $this->operators->resolve($recipient) ?? 'default';
                $rate = (float) $this->config->get("sms.pricing.lafricamobile.{$destination}", 0);
                $results[$recipient] = SmsResult::sent(
                    to: $recipient,
                    provider: $this->id(),
                    providerMessageId: $pushId,
                    segmentsCount: $segments,
                    costEstimate: $rate * $segments,
                );
            } else {
                $code = (string) ($body['error'] ?? $body['code'] ?? $response->status());
                $results[$recipient] = SmsResult::failed($recipient, $this->id(), "lam_error_{$code}");
            }
        }

        $integration->forceFill(['last_used_at' => now()])->save();

        return $results;
    }

    /**
     * Per-message return URL signed by Laravel + secret token + the
     * notification id; the LAM webhook controller validates all three.
     * The TTL prevents an indefinite replay window if LAM logs/leaks
     * the URL — DLRs after the window are rejected as
     * "Invalid signature".
     */
    private function buildReturnUrl(int $notificationId): string
    {
        $token = (string) $this->config->get('sms.webhook_url_token', '');
        $ttlDays = (int) $this->config->get('sms.lafricamobile.dlr_signature_ttl_days', 7);

        return URL::temporarySignedRoute(
            'sms.webhook.lafricamobile',
            now()->addDays(max(1, $ttlDays)),
            [
                'token' => $token,
                'notification' => $notificationId,
            ],
        );
    }

    /**
     * Pin the LAM endpoint to known hosts. Without this an admin (or an
     * attacker who has compromised an Integration row) could redirect
     * authenticated POSTs — including the LAM `password` field — to an
     * internal address (`169.254.169.254`, Redis, …). Default config
     * URL is allowed by definition; per-integration overrides must
     * resolve to an `https://*.lafricamobile.com` host.
     *
     * @param  array<string,mixed>  $creds
     * @param  array<string,mixed>  $metadata
     */
    private function resolveSendUrl(array $creds, array $metadata): string
    {
        $default = (string) $this->config->get('sms.lafricamobile.send_url');
        $override = (string) ($creds['host'] ?? $metadata['host'] ?? '');
        if ($override === '' || $override === $default) {
            return $default;
        }
        $parts = parse_url($override);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        $isAllowed = $scheme === 'https'
            && ($host === 'lafricamobile.com' || str_ends_with($host, '.lafricamobile.com'));
        if (! $isAllowed) {
            Log::warning('[sms.lam] rejected non-allowlisted host override', [
                'host' => $host !== '' ? $host : '(unparseable)',
            ]);

            return $default;
        }

        return $override;
    }

    /**
     * @param  list<string>  $recipients
     * @return array<string,SmsResult>
     */
    private function failAll(array $recipients, string $reason): array
    {
        $out = [];
        foreach ($recipients as $r) {
            $out[$r] = SmsResult::failed($r, $this->id(), $reason);
        }

        return $out;
    }
}
