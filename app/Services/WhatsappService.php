<?php

namespace App\Services;


use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

class WhatsappService
{


    public function __construct()
    {
    }

    public function getClient(): PendingRequest
    {
        return Http::withToken($this->getAccessToken())->asJson();
    }

    public function getAccessToken(): ?string
    {
        return config('services.services.whatsapp.auth_token');
    }

    public function getBaseUrl(): string
    {
        return config('services.services.whatsapp.base_url') .
            '/' .
            config('services.services.whatsapp.api_version');
    }

    public function getUrlWithPhoneNumber(): string
    {
        return $this->getBaseUrl() . '/' . $this->getFrom();
    }

    public function getUrlWithBusinessAccountId(): string
    {
        return $this->getBaseUrl() . '/' . $this->getBusinessAccountId();
    }

    public function getFrom(): string
    {
        return config('services.services.whatsapp.from');
    }

    public function getBusinessAccountId(): string
    {
        return config('services.services.whatsapp.business_account_id');
    }

    public function sendMessage(string $type, array $content, $to): bool
    {
        if (!is_array($to)) $to = [$to];

        foreach ($to as $t) {
            $t = Utils::formatPhones($t, false);
            if(count($t) != 12) continue;
            $data = [
                'messaging_product' => 'whatsapp',
                'recipient_type' => 'individual',
                'to' => $t,
                'type' => $type,
                $type => $content
            ];
            $this->getClient()->post($this->getUrlWithPhoneNumber() . '/messages', $data);

        }

        return true;
    }

    public function sendTextMessage(string $message, string|array $to): bool
    {
        if (!is_array($to)) $to = [$to];

        foreach ($to as $t) {
            $data = [
                "messaging_product" => "whatsapp",
                "recipient_type" => "individual",
                "to" => Utils::formatPhones($t, false),
                "type" => "text",
                "text" => [
                    "preview_url" => false,
                    "body" => $message
                ]
            ];
            $this->getClient()->post($this->getUrlWithPhoneNumber() . '/messages', $data);
        }
        return true;
    }

    public function sendTemplateMessage(string $template, string|array $to): bool
    {
        if (!is_array($to)) $to = [$to];

        foreach ($to as $t) {
            $data = [
                'messaging_product' => 'whatsapp',
                'recipient_type' => 'individual',
                'to' => Utils::formatPhones($t, false),
                'type' => 'template',
                "template" => [
                    "name" => $template,
                    "language" => ['code' => 'en_US']
                ]
            ];
            $this->getClient()->post($this->getUrlWithPhoneNumber() . '/messages', $data);
        }
        return true;
    }

    public function sendMediaMessage(string $type, string $link, string|array $to): bool
    {
        if (!is_array($to)) $to = [$to];

        foreach ($to as $t) {
            $data = [
                'messaging_product' => 'whatsapp',
                'recipient_type' => 'individual',
                'to' => Utils::formatPhones($t, false),
                'type' => $type,
                $type => [
                    'link' => $link
                ]
            ];
            $this->getClient()->post($this->getUrlWithPhoneNumber() . '/messages', $data);
        }
        return true;
    }

    public function getRelatedPhoneNumber(): PromiseInterface|Response
    {
        return $this->getClient()->get($this->getUrlWithBusinessAccountId() . '/phone_numbers');
    }
}
