<?php

namespace App\Domain\Integrations\Providers;

class IntegrationProviderRegistry
{
    /** @var list<string> */
    public const GENERIC_KEYS = ['sms_orange', 'sms_mtarget', 'sms_lafricamobile', 'whatsapp_cloud', 'mailgun'];

    /** @return list<string> */
    public function keys(): array
    {
        return array_keys($this->all());
    }

    /**
     * @return array<string,IntegrationProvider>
     */
    public function all(): array
    {
        $providers = [
            new WaveProvider,
            new OrangeMoneyProvider,
            new LemonSqueezyProvider,
            new StripeProvider,
            // P98.07 (TCK-1170) — `mail` et `sms` ont quitté le registre : aucun pilote ne lisait
            // leur ligne (le courriel lit `MAIL_*`, le SMS les clés `sms_*`). Une ligne déjà
            // enregistrée sous ces clés reste lisible par le schéma générique de `get()`.
        ];
        // TCK-602 — les fournisseurs que les pilotes et l'écran d'intégration désignent sans
        // schéma propre : servis comme avant par `GenericProvider`, mais NOMMÉS, puisque la
        // création d'une intégration borne `provider` aux clés de ce registre.
        foreach (self::GENERIC_KEYS as $key) {
            $providers[] = new GenericProvider($key);
        }

        return collect($providers)->mapWithKeys(fn (IntegrationProvider $provider) => [$provider->key() => $provider])->all();
    }

    public function get(string $provider): IntegrationProvider
    {
        return $this->all()[$provider] ?? new GenericProvider($provider);
    }
}
