<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class OrangeService
{
    private string $_apiUrl;
    //private string $_clientId;
    //private string $_clientSecret;
    private string $_authorizationHeader;
    private string $_senderNumber;
    //private string $_senderName;

    public function __construct()
    {
        $this->_apiUrl = config('services.services.orange.api_url');
        //$this->_clientId = config('services.services.orange.client_id');
        //$this->_clientSecret = config('services.services.orange.client_secret');
        $this->_authorizationHeader = config('services.services.orange.authorization_header');
        $this->_senderNumber = config('services.services.orange.sender_number');
        //$this->_senderName = config('services.services.orange.sender_name');
    }

    public function sendSMS(string $message, string|array $to): bool
    {
        if (!$to) return false;
        if (!$token = $this->requestToken()) return false;
        if (!is_array($to)) $to = [$to];
        $to = utils()::formatPhones($to, false);
        foreach ($to as $t) {
            Http::withToken($token['access_token'])
                ->post($this->_apiUrl . '/smsmessaging/v1/outbound/tel:+' . $this->_senderNumber . '/requests', [
                    'outboundSMSMessageRequest' => [
                        'address' => 'tel:+' . $t,
                        'senderAddress' => 'tel:+' . $this->_senderNumber,
                        //'senderName' => $this->_senderName,
                        'outboundSMSTextMessage' => [
                            'message' => $message
                        ]
                    ]
                ]);
        }

        return true;
    }

    private function requestToken()
    {
        $response = Http::withHeaders(['Authorization' => $this->_authorizationHeader, 'Accept' => 'application/json'])
            ->withBody('grant_type=client_credentials', 'application/x-www-form-urlencoded')
            ->post($this->_apiUrl . '/oauth/v3/token', ['grant_type' => 'client_credentials']);
        if ($response->successful()) {
            return $response->json();
        }
        return null;
    }
}
