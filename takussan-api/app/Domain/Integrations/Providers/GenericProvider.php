<?php

namespace App\Domain\Integrations\Providers;

class GenericProvider extends AbstractProvider
{
    public function __construct(private readonly string $provider) {}

    public function key(): string
    {
        return $this->provider;
    }

    public function label(): string
    {
        return str($this->provider)->replace('_', ' ')->headline()->toString();
    }

    public function category(): string
    {
        return 'other';
    }

    public function schema(): array
    {
        return [
            ['name' => 'api_key', 'label' => 'API key', 'type' => 'password', 'secret' => true, 'required' => true],
        ];
    }
}
