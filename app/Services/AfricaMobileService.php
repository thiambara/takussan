<?php

namespace App\Services;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

class AfricaMobileService
{
    private string $_apiUrl;
    private string $_accountId;
    private string $_password;
    private string $_sender;
    private string $_apiKey;

    public function __construct()
    {
        $this->_apiUrl = config('services.services.africa_mobile.api_url');
        $this->_accountId = config('services.services.africa_mobile.account_id');
        $this->_password = config('services.services.africa_mobile.password');
        $this->_sender = config('services.services.africa_mobile.sender');
        $this->_apiKey = config('services.services.africa_mobile.api_key');
    }

    public function sendSMS(string $message, string|array $to, ?string $sender = null): bool|Response
    {
        $sender && $this->_sender = $sender;
        if(!$to){
            return false;
        }
        if (!is_array($to)) $to = [$to];
        $to = utils()::formatPhones($to);
        return Http::withHeaders(['headers' => ['Content-Type' => 'text/xml;charset=utf-8']])
            ->withBody($this->getXMLFormat($message, $to), 'text/xml;charset=utf-8')
            ->post($this->_apiUrl);
    }

    private function getHashMac(): string
    {
        return hash_hmac("sha256", $this->_password . '&' . $this->_accountId . '&' . $this->_apiKey, $this->_apiKey);
    }

    private function getXMLFormat(string $message, array $to): string
    {
        $messages = '';
        foreach ($to as $t){
            $messages .= '<message><text>' . $message . '</text><to>' . $t . '</to></message>';
        }
        return '<?xml version="1.0" encoding="utf-8"?><push datacoding="utf-8" accountid="' . $this->_accountId . '" password="' . $this->_password . '" userdata="User Data  Multiple Sent" sender="' . $this->_sender . '">'. $messages .'</push>';

    }
}
