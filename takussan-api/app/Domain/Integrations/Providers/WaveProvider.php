<?php

namespace App\Domain\Integrations\Providers;

class WaveProvider extends AbstractProvider
{
    public function key(): string
    {
        return 'wave';
    }

    public function label(): string
    {
        return 'Wave';
    }

    public function category(): string
    {
        return 'payments';
    }

    public function schema(): array
    {
        return [
            ['name' => 'api_key', 'label' => 'API key', 'type' => 'password', 'secret' => true, 'required' => true],
            ['name' => 'webhook_secret', 'label' => 'Webhook secret', 'type' => 'password', 'secret' => true, 'required' => true],
        ];
    }
}
