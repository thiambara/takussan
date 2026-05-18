<?php

namespace App\Domain\Integrations\Providers;

class MailProvider extends AbstractProvider
{
    public function key(): string
    {
        return 'mail';
    }

    public function label(): string
    {
        return 'Email provider';
    }

    public function category(): string
    {
        return 'email';
    }

    public function schema(): array
    {
        return [
            ['name' => 'api_key', 'label' => 'API key', 'type' => 'password', 'secret' => true, 'required' => true],
            ['name' => 'from_email', 'label' => 'Adresse expéditeur', 'type' => 'email', 'secret' => false, 'required' => true],
        ];
    }
}
