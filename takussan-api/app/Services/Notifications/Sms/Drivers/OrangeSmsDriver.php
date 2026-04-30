<?php

namespace App\Services\Notifications\Sms\Drivers;

use App\Services\Notifications\Sms\IntegrationLocator;
use App\Services\Notifications\Sms\OperatorResolver;
use App\Services\Notifications\Sms\OrangeOAuthTokenCache;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Services\Notifications\Sms\SmsDriverInterface;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsSegmentCalculator;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Contracts\Config\Repository as ConfigRepository;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Support\Facades\Cache;
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
                // Token might have just expired. Re-read the cache under the
                // OAuth lock — if a peer worker already refreshed, we use
                // their token; only the first 401 in the window actually
                // triggers a new `/oauth/v3/token` round-trip.
                $token = $this->refreshTokenIfStale($integration->id, $token, $creds);
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

        // Single-flight refresh: under burst load (N queue workers waking
        // at the same minute) only one process should hit Orange's
        // `/oauth/v3/token`, the rest must read the freshly cached token.
        return $this->withOAuthLock($integrationId, function () use ($integrationId, $creds): ?string {
            // Double-check: another worker may have refreshed while we
            // were waiting for the lock.
            $cached = $this->tokenCache->get($integrationId);
            if ($cached !== null) {
                return $cached;
            }

            return $this->refreshToken($integrationId, $creds);
        });
    }

    /**
     * Called from the 401 retry path. Re-reads the cache under the OAuth
     * lock; if a peer already refreshed since we attempted the send, we
     * adopt their token. Only when the cache still holds the token we
     * just used (or is empty) do we actually call `/oauth/v3/token`.
     *
     * @param  array<string,mixed>  $creds
     */
    private function refreshTokenIfStale(int $integrationId, string $previousToken, array $creds): ?string
    {
        return $this->withOAuthLock($integrationId, function () use ($integrationId, $previousToken, $creds): ?string {
            $cached = $this->tokenCache->get($integrationId);
            if ($cached !== null && $cached !== $previousToken) {
                return $cached;
            }
            $this->tokenCache->forget($integrationId);

            return $this->refreshToken($integrationId, $creds);
        });
    }

    /**
     * Acquire the per-integration OAuth lock and run the callback.
     * Falls back to running the callback directly if the configured
     * cache store cannot lock (defensive — the framework's database /
     * redis / file stores all support locks).
     *
     * @template T
     *
     * @param  \Closure(): T  $callback
     * @return T
     */
    private function withOAuthLock(int $integrationId, \Closure $callback)
    {
        $key = "sms:orange:oauth:{$integrationId}";
        $lock = Cache::lock($key, 10);
        try {
            return $lock->block(5, $callback);
        } catch (LockTimeoutException $e) {
            Log::warning('[sms.orange] OAuth lock timeout', ['key' => $key]);

            return $callback();
        }
    }

    /**
     * Actually call Orange's OAuth endpoint and write the result to the
     * cache. Caller MUST hold the OAuth lock for {@see $integrationId}.
     *
     * @param  array<string,mixed>  $creds
     */
    private function refreshToken(int $integrationId, array $creds): ?string
    {
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
