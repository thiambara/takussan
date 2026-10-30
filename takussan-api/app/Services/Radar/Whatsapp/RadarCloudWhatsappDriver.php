<?php

namespace App\Services\Radar\Whatsapp;

use App\Services\Notifications\Sms\AmbiguousDelivery;
use App\Services\Notifications\Whatsapp\WhatsappResult;
use App\Services\Notifications\Whatsapp\WhatsappTemplateRef;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Support\Facades\Log;

/**
 * TCK-2395 (ADR-0077 §5) — l'API Graph de Meta, sur le numéro du Radar SEUL : `POST {base_uri}/{phone_number_id du
 * Radar}/messages`, avec le jeton du Radar. Identifiant et jeton viennent de {@see RadarWhatsappNumber}, qui refuse
 * d'abord un numéro absent ou égal à celui des notifications. Seule l'adresse de l'API (`whatsapp.base_uri`, version
 * figée) est commune aux deux numéros : elle ne désigne aucun numéro.
 *
 * Un échec est AMBIGU quand Meta a pu accepter le message (délai dépassé, 5xx, {@see AmbiguousDelivery}) : l'appelant
 * ne le renvoie pas.
 */
final class RadarCloudWhatsappDriver implements RadarWhatsappDriver
{
    public function __construct(
        private readonly HttpFactory $http,
        private readonly RadarWhatsappNumber $number,
    ) {}

    public function sendTemplate(string $to, WhatsappTemplateRef $template, string $callbackData): WhatsappResult
    {
        $this->number->assertUsable();
        $url = rtrim((string) config('whatsapp.base_uri'), '/').'/'.$this->number->phoneNumberId().'/messages';

        try {
            $response = $this->http
                ->withToken($this->number->accessToken())
                ->acceptJson()
                ->timeout(10)
                ->post($url, $this->payload($to, $template, $callbackData));
        } catch (\Throwable $e) {
            Log::warning('[radar.whatsapp] HTTP exception', ['error' => class_basename($e)]);

            return WhatsappResult::failed($to, self::PROVIDER, 'whatsapp_http_exception', AmbiguousDelivery::fromThrowable($e));
        }

        $body = $response->json() ?? [];
        $messageId = (string) ($body['messages'][0]['id'] ?? '');
        if ($response->successful() && $messageId !== '') {
            return WhatsappResult::sent($to, self::PROVIDER, $messageId);
        }

        $code = (string) ($body['error']['code'] ?? $body['error']['error_subcode'] ?? $response->status());

        return WhatsappResult::failed($to, self::PROVIDER, "whatsapp_error_{$code}", AmbiguousDelivery::fromStatus($response->status()));
    }

    /** @return array<string, mixed> */
    private function payload(string $to, WhatsappTemplateRef $template, string $callbackData): array
    {
        $payload = [
            'messaging_product' => 'whatsapp',
            // Meta attend le numéro sans le `+`.
            'to' => ltrim($to, '+'),
            'type' => 'template',
            'template' => ['name' => $template->name, 'language' => ['code' => $template->language]],
            // TCK-2436 — rendu tel quel dans les accusés (`statuses`), dont ceux d'un envoi resté ambigu.
            'biz_opaque_callback_data' => $callbackData,
        ];
        if ($template->params !== []) {
            $payload['template']['components'] = [[
                'type' => 'body',
                'parameters' => array_map(fn (string $value): array => ['type' => 'text', 'text' => $value], array_values($template->params)),
            ]];
        }

        return $payload;
    }
}
