<?php

namespace App\Domain\Integrations\Providers;

class IntegrationProviderRegistry
{
    /**
     * @return array<string,IntegrationProvider>
     */
    public function all(): array
    {
        $providers = [
            new WaveProvider,
            new OrangeMoneyProvider,
            new StripeProvider,
            new SmsProvider,
            new MailProvider,
        ];

        return collect($providers)->mapWithKeys(fn (IntegrationProvider $provider) => [$provider->key() => $provider])->all();
    }

    public function get(string $provider): IntegrationProvider
    {
        return $this->all()[$provider] ?? new GenericProvider($provider);
    }
}
