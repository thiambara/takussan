<?php

namespace App\Domain\Integrations\Providers;

class StripeProvider extends AbstractProvider
{
    public function key(): string
    {
        return 'stripe';
    }

    public function label(): string
    {
        return 'Stripe';
    }

    public function category(): string
    {
        return 'payments';
    }

    public function schema(): array
    {
        return [
            ['name' => 'secret_key', 'label' => 'Secret key', 'type' => 'password', 'secret' => true, 'required' => true],
            ['name' => 'webhook_secret', 'label' => 'Webhook secret', 'type' => 'password', 'secret' => true, 'required' => false],
        ];
    }
}
