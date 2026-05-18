<?php

namespace App\Domain\Integrations\Providers;

class SmsProvider extends AbstractProvider
{
    public function key(): string
    {
        return 'sms';
    }

    public function label(): string
    {
        return 'SMS';
    }

    public function category(): string
    {
        return 'messaging';
    }

    public function schema(): array
    {
        return [
            ['name' => 'api_key', 'label' => 'API key', 'type' => 'password', 'secret' => true, 'required' => true],
            ['name' => 'sender', 'label' => 'Sender ID', 'type' => 'text', 'secret' => false, 'required' => true],
        ];
    }
}
