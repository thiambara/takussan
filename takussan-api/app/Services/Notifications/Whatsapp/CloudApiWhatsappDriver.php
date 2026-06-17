<?php

namespace App\Services\Notifications\Whatsapp;

use App\Services\Notifications\Sms\IntegrationLocator;
use App\Services\Notifications\Sms\PhoneNumber;
use Illuminate\Contracts\Config\Repository as ConfigRepository;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Support\Facades\Log;

/**
 * TCK-282 — WhatsApp Cloud API (Meta Graph) driver.
 *
 * POST `{base_uri}/{phone_number_id}/messages` with the system-user access
 * token. Supports `text` messages (inside the 24h service window) and
 * `template` messages (outside it). Returns the `wamid` provider message id
 * so DLR webhooks (TCK-283) can match the attempt.
 *
 * Credentials live in the agency's (or global) Integration row
 * `provider = whatsapp_cloud`: `phone_number_id` + `access_token`.
 */
class CloudApiWhatsappDriver implements WhatsappDriverInterface
{
    public function __construct(
        private readonly HttpFactory $http,
        private readonly ConfigRepository $config,
        private readonly IntegrationLocator $integrations,
    ) {}

    public function id(): string
    {
        return 'whatsapp_cloud';
    }

    public function send(array|string $to, WhatsappMessage $message, array $context = []): array
    {
        $recipients = array_values(array_unique(array_map(
            fn (string $n) => PhoneNumber::normalize($n),
            is_array($to) ? $to : [$to],
        )));

        $provider = (string) $this->config->get('whatsapp.integration_provider', 'whatsapp_cloud');
        $integration = $this->integrations->find($context['agency_id'] ?? null, $provider);
        if ($integration === null) {
            return $this->failAll($recipients, 'whatsapp_integration_missing');
        }
        $creds = $integration->credentials ?? [];
        $phoneNumberId = (string) ($creds['phone_number_id'] ?? '');
        $token = (string) ($creds['access_token'] ?? '');
        if ($phoneNumberId === '' || $token === '') {
            return $this->failAll($recipients, 'whatsapp_credentials_missing');
        }

        $baseUri = rtrim((string) $this->config->get('whatsapp.base_uri'), '/');
        $url = "{$baseUri}/{$phoneNumberId}/messages";

        $results = [];
        foreach ($recipients as $recipient) {
            $results[$recipient] = $this->sendOne($url, $token, $recipient, $message);
        }

        $integration->forceFill(['last_used_at' => now()])->save();

        return $results;
    }

    private function sendOne(string $url, string $token, string $recipient, WhatsappMessage $message): WhatsappResult
    {
        try {
            $response = $this->http
                ->withToken($token)
                ->acceptJson()
                ->timeout(10)
                ->post($url, $this->payloadFor($recipient, $message));
        } catch (\Throwable $e) {
            Log::warning('[whatsapp.cloud] HTTP exception', ['error' => $e->getMessage()]);

            return WhatsappResult::failed($recipient, $this->id(), 'whatsapp_http_exception');
        }

        $body = $response->json() ?? [];
        $messageId = (string) ($body['messages'][0]['id'] ?? '');
        if ($response->successful() && $messageId !== '') {
            return WhatsappResult::sent($recipient, $this->id(), $messageId);
        }

        $errCode = (string) (
            $body['error']['code']
            ?? $body['error']['error_subcode']
            ?? $response->status()
        );

        return WhatsappResult::failed($recipient, $this->id(), "whatsapp_error_{$errCode}");
    }

    /**
     * @return array<string,mixed>
     */
    private function payloadFor(string $recipient, WhatsappMessage $message): array
    {
        // Meta expects the MSISDN without the leading `+`.
        $to = ltrim($recipient, '+');
        $base = ['messaging_product' => 'whatsapp', 'to' => $to];

        if ($message->isTemplate()) {
            $template = $message->template;
            $payload = $base + [
                'type' => 'template',
                'template' => [
                    'name' => $template->name,
                    'language' => ['code' => $template->language],
                ],
            ];
            if (! empty($template->params)) {
                $payload['template']['components'] = [[
                    'type' => 'body',
                    'parameters' => array_map(
                        fn (string $value) => ['type' => 'text', 'text' => $value],
                        array_values($template->params),
                    ),
                ]];
            }

            return $payload;
        }

        return $base + [
            'type' => 'text',
            'text' => ['body' => (string) $message->text],
        ];
    }

    /**
     * @param  list<string>  $recipients
     * @return array<string,WhatsappResult>
     */
    private function failAll(array $recipients, string $reason): array
    {
        $out = [];
        foreach ($recipients as $r) {
            $out[$r] = WhatsappResult::failed($r, $this->id(), $reason);
        }

        return $out;
    }
}
