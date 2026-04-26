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

/**
 * TCK-102 — Mtarget SMS driver.
 *
 * Endpoint: POST {send_url} (form-urlencoded).
 * Auth   : `username` / `password` in the body.
 * Batch  : `msisdn` is a comma-separated list, max 500 per call.
 * Errors : Mtarget returns negative codes (-1 … -15) — mapped to
 *          {@see SmsResult::failed()} with a stable `failure_reason`.
 *
 * Multi-recipient calls are batched in chunks of 500. Each chunk
 * generates a single HTTP request — successes are split per-recipient
 * in the returned map.
 */
class MtargetSmsDriver implements SmsDriverInterface
{
    public function __construct(
        private readonly HttpFactory $http,
        private readonly ConfigRepository $config,
        private readonly IntegrationLocator $integrations,
        private readonly OperatorResolver $operators,
    ) {}

    public function id(): string
    {
        return 'mtarget';
    }

    public function send(array|string $to, string $message, array $context = []): array
    {
        $recipients = array_values(array_unique(array_map(
            fn (string $n) => PhoneNumber::normalize($n),
            is_array($to) ? $to : [$to],
        )));
        $integration = $this->integrations->find($context['agency_id'] ?? null, 'sms_mtarget');
        if ($integration === null) {
            return $this->failAll($recipients, 'mtarget_integration_missing');
        }
        $creds = $integration->credentials ?? [];
        $url = (string) $this->config->get('sms.mtarget.send_url');
        $batchMax = (int) $this->config->get('sms.mtarget.batch_max', 500);
        $segments = SmsSegmentCalculator::segmentsCount($message);
        $isUnicode = SmsSegmentCalculator::isUnicode($message);
        $senderId = (string) ($context['sender_id']
            ?? $integration->metadata['sender_id']
            ?? $creds['sender_id']
            ?? 'TAKUSSAN');

        $results = [];
        foreach (array_chunk($recipients, $batchMax) as $chunk) {
            $payload = [
                'username' => $creds['username'] ?? '',
                'password' => $creds['password'] ?? '',
                'msisdn' => implode(',', array_map(fn ($n) => ltrim($n, '+'), $chunk)),
                'msg' => $message,
                'sender' => $senderId,
                'allowunicode' => $isUnicode ? 'true' : 'false',
            ];
            if (! empty($creds['service_id'])) {
                $payload['serviceid'] = $creds['service_id'];
            }

            try {
                $response = $this->http->asForm()
                    ->timeout(10)
                    ->post($url, $payload);
            } catch (\Throwable $e) {
                Log::warning('[sms.mtarget] HTTP exception', ['error' => $e->getMessage()]);
                foreach ($chunk as $n) {
                    $results[$n] = SmsResult::failed($n, $this->id(), 'mtarget_http_exception');
                }

                continue;
            }

            $body = $response->json() ?? [];
            $code = (int) ($body['results'][0]['code'] ?? $body['code'] ?? ($response->successful() ? 0 : -1));
            $msgId = (string) ($body['results'][0]['ticket'] ?? $body['ticket'] ?? '');

            if ($response->successful() && $code >= 0) {
                $costRate = $this->priceFor($chunk, $segments);
                foreach ($chunk as $n) {
                    $results[$n] = SmsResult::sent(
                        to: $n,
                        provider: $this->id(),
                        providerMessageId: $msgId !== '' ? $msgId.'|'.$n : 'mtarget_'.uniqid(),
                        segmentsCount: $segments,
                        costEstimate: $costRate * $segments,
                    );
                }
            } else {
                $reason = 'mtarget_error_'.$code;
                foreach ($chunk as $n) {
                    $results[$n] = SmsResult::failed($n, $this->id(), $reason);
                }
            }
        }

        $integration->forceFill(['last_used_at' => now()])->save();

        return $results;
    }

    /**
     * @param  list<string>  $recipients
     */
    private function priceFor(array $recipients, int $segments): float
    {
        $first = $recipients[0] ?? null;
        $destination = $first ? ($this->operators->resolve($first) ?? 'default') : 'default';
        $rate = (float) $this->config->get("sms.pricing.mtarget.{$destination}", 0);

        return $rate;
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
