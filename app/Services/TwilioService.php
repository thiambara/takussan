<?php

namespace App\Services;

use Twilio\Exceptions\ConfigurationException;
use Twilio\Exceptions\TwilioException;
use Twilio\Rest\Api\V2010\Account\MessageInstance;
use Twilio\Rest\Client;

class TwilioService
{
    private Client $_client;

    /**
     * @throws ConfigurationException
     */
    public function __construct()
    {
        $this->_client = new Client(config('services.twilio.auth_token'), );
    }

    /**
     * @throws TwilioException
     * @throws ConfigurationException
     */
    public function sendWhatsappMessage(string $message, string|array $to): mixed
    {
        if(!is_array($to)) $to = [$to];
        $to = utils()::formatPhones($to);
        foreach ($to as $item) {
            $this->_client->messages
                ->create("whatsapp:" . $item,
                    array(
                        "from" => "whatsapp:" . config('services.twilio.whatsapp_from'),
                        "body" => $message
                    )
                );
        }
        return true;

    }

    /**
     * @throws TwilioException
     */
    public function sendSMS(string $message, string|array $to): mixed
    {
        if(!is_array($to)) $to = [$to];
        $to = utils()::formatPhones($to);
        foreach ($to as $item) {
            $this->_client->messages
                ->create($item,
                    array(
                        "body" => $message
                    ));
        }

        return true;

    }
}


