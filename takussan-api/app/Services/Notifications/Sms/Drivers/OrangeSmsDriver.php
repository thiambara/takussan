<?php

namespace App\Services\Notifications\Sms\Drivers;

use App\Services\Notifications\Sms\IntegrationLocator;
use App\Services\Notifications\Sms\OperatorResolver;
use App\Services\Notifications\Sms\OrangeOAuthTokenCache;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Services\Notifications\Sms\SmsDriverInterface;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsSegmentCalculator;
use Illuminate\Contracts\Config\Repository as ConfigRepository;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Support\Facades\Log;

/**
 * TCK-102 — Orange Sénégal SMS driver (developer.orange.com/apis/sms-sn).
 *
 * - OAuth 2.0 client_credentials → cached in Redis with TTL
 *   `expires_in - 60s` via {@see OrangeOAuthTokenCache}.
 * - POST `/smsmessaging/v1/outbound/{senderAddress}/requests` — one
 *   recipient per call (no batch). Numbers must be E.164 +221.
 * - 3 SMS / day / MSISDN cap is enforced upstream by the router via
 *   {@see OrangeDailyCapTracker} so this driver never trips it; we
 *   nonetheless handle the upstream `429` / quota error code by
 *   returning {@see SmsResult::deferred()} so the router routes to
 *   the next driver in the chain.
 */
class OrangeSmsDriver implements SmsDriverInterface
{
    public function __construct(
        private readonly HttpFactory $http,
        private readonly ConfigRepository $config,
        private readonly IntegrationLocator $integrations,
        private readonly OperatorResolver $operators,
        private readonly OrangeOAuthTokenCache $tokenCache,
    ) {}

    public function id(): string
    {
        return 'orange';
    }

    public function send(array|string $to, string $message, array $context = []): array
    {
        $recipients = array_values(array_unique(array_map(
            fn (string $n) => PhoneNumber::normalize($n),
            is_array($to) ? $to : [$to],
        )));
        $integration = $this->integrations->find($context['agency_id'] ?? null, 'sms_orange');
        if ($integration === null) {
            return $this->failAll($recipients, 'orange_integration_missing');
        }
        $creds = $integration->credentials ?? [];
        $senderAddress = (string) ($creds['sender_address'] ?? $integration->metadata['sender_address'] ?? '');
        if ($senderAddress === '') {
            return $this->failAll($recipients, 'orange_sender_address_missing');
        }
        $senderName = (string) ($context['sender_id']
            ?? $integration->metadata['sender_name']
            ?? $creds['sender_name']
            ?? '');

        $token = $this->getToken($integration->id, $creds);
        if ($token === null) {
            return $this->failAll($recipients, 'orange_oauth_failed');
        }

        $segments = SmsSegmentCalculator::segmentsCount($message);
        $sendUrlTemplate = (string) $this->config->get('sms.orange.send_url');
        $rate = (float) $this->config->get('sms.pricing.orange.orange', 0);

        $results = [];
        foreach ($recipients as $recipient) {
            // Orange is country-locked to +221.
            if (! str_starts_with($recipient, '+221')) {
                $results[$recipient] = SmsResult::deferred($recipient, $this->id(), 'orange_only_senegal_msisdn');

                continue;
            }
            $url = str_replace('{senderAddress}', urlencode($senderAddress), $sendUrlTemplate);
            $payload = [
                'outboundSMSMessageRequest' => [
                    'address' => 'tel:'.$recipient,
                    'senderAddress' => $senderAddress,
                    'outboundSMSTextMessage' => ['message' => $message],
                ],
            ];
            if ($senderName !== '') {
                $payload['outboundSMSMessageRequest']['senderName'] = $senderName;
            }
            try {
                $response = $this->http
                    ->withToken($token)
                    ->acceptJson()
                    ->timeout(10)
                    ->post($url, $payload);
            } catch (\Throwable $e) {
                Log::warning('[sms.orange] HTTP exception', ['error' => $e->getMessage()]);
                $results[$recipient] = SmsResult::failed($recipient, $this->id(), 'orange_http_exception');

                continue;
            }
            if ($response->status() === 401) {
                // Token might have just expired — drop cache and retry once.
                $this->tokenCache->forget($integration->id);
                $token = $this->getToken($integration->id, $creds);
                if ($token === null) {
                    $results[$recipient] = SmsResult::failed($recipient, $this->id(), 'orange_oauth_failed');

                    continue;
                }
                $response = $this->http
                    ->withToken($token)
                    ->acceptJson()
                    ->timeout(10)
                    ->post($url, $payload);
            }
            if ($response->status() === 429) {
                $results[$recipient] = SmsResult::deferred($recipient, $this->id(), 'orange_rate_limited');

                continue;
            }
            $body = $response->json() ?? [];
            $resourceUrl = (string) (
                $body['outboundSMSMessageRequest']['resourceURL']
                ?? $body['resourceURL']
                ?? ''
            );
            if ($response->successful() && $resourceUrl !== '') {
                $messageId = basename(parse_url($resourceUrl, PHP_URL_PATH) ?: $resourceUrl);
                $results[$recipient] = SmsResult::sent(
                    to: $recipient,
                    provider: $this->id(),
                    providerMessageId: $messageId,
                    segmentsCount: $segments,
                    costEstimate: $rate * $segments,
                );
            } else {
                $errCode = (string) (
                    $body['requestError']['serviceException']['messageId']
                    ?? $body['requestError']['policyException']['messageId']
                    ?? $response->status()
                );
                $results[$recipient] = SmsResult::failed($recipient, $this->id(), "orange_error_{$errCode}");
            }
        }

        $integration->forceFill(['last_used_at' => now()])->save();

        return $results;
    }

    /**
     * @param  array<string,mixed>  $creds
     */
    private function getToken(int $integrationId, array $creds): ?string
    {
        $cached = $this->tokenCache->get($integrationId);
        if ($cached !== null) {
            return $cached;
        }
        $clientId = (string) ($creds['client_id'] ?? '');
        $clientSecret = (string) ($creds['client_secret'] ?? '');
        if ($clientId === '' || $clientSecret === '') {
            return null;
        }
        try {
            $response = $this->http
                ->asForm()
                ->withBasicAuth($clientId, $clientSecret)
                ->timeout(10)
                ->post(
                    (string) $this->config->get('sms.orange.oauth_token_url'),
                    ['grant_type' => 'client_credentials'],
                );
        } catch (\Throwable $e) {
            Log::warning('[sms.orange] OAuth exception', ['error' => $e->getMessage()]);

            return null;
        }
        $body = $response->json() ?? [];
        $token = (string) ($body['access_token'] ?? '');
        if (! $response->successful() || $token === '') {
            return null;
        }
        $expiresIn = (int) ($body['expires_in'] ?? 3600);
        $this->tokenCache->put($integrationId, $token, $expiresIn);

        return $token;
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
