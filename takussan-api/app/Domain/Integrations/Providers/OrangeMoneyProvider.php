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
            // TCK-602 (ADR-0051 §3) — exactement ce que lit `OrangeMoneyDriver::CREDENTIAL_KEYS`
            // (`PaymentDriverCredentialsTest`) : l'`api_key` d'avant n'était lue par personne, et
            // l'`access_token` que lisait le pilote n'était demandé par personne.
            ['name' => 'client_id', 'label' => 'Client ID', 'type' => 'text', 'secret' => false, 'required' => true],
            ['name' => 'client_secret', 'label' => 'Client secret', 'type' => 'password', 'secret' => true, 'required' => true],
            ['name' => 'merchant_key', 'label' => 'Merchant key', 'type' => 'text', 'secret' => false, 'required' => true],
            ['name' => 'webhook_secret', 'label' => 'Webhook secret', 'type' => 'password', 'secret' => true, 'required' => true],
        ];
    }
}
