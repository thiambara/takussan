<?php

namespace App\Domain\Integrations\Providers;

class OrangeMoneyProvider extends AbstractProvider
{
    public function key(): string
    {
        return 'orange_money';
    }

    public function label(): string
    {
        return 'Orange Money';
    }

    public function category(): string
    {
        return 'payments';
    }

    public function schema(): array
    {
        return [
            ['name' => 'merchant_key', 'label' => 'Merchant key', 'type' => 'text', 'secret' => false, 'required' => true],
            ['name' => 'api_key', 'label' => 'API key', 'type' => 'password', 'secret' => true, 'required' => true],
            ['name' => 'webhook_secret', 'label' => 'Webhook secret', 'type' => 'password', 'secret' => true, 'required' => true],
        ];
    }
}
