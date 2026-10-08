<?php

namespace Tests\Unit\Payments;

use App\Domain\Integrations\Providers\IntegrationProviderRegistry;
use App\Services\Payments\PaymentGatewayService;
use Tests\TestCase;

/**
 * TCK-602 (ADR-0051 §3, AC26) — le schéma d'un fournisseur de paiement est LA liste des clés : chaque
 * clé que son pilote lit (`CREDENTIAL_KEYS`) est un champ `required` du schéma. Sans cela, l'écran
 * enregistre une intégration que le pilote ne sait pas utiliser — Orange Money lisait
 * `access_token` quand son schéma demandait `api_key`.
 */
class PaymentDriverCredentialsTest extends TestCase
{
    public function test_every_key_a_driver_reads_is_a_required_field_of_its_provider_schema(): void
    {
        $registry = app(IntegrationProviderRegistry::class);
        $this->assertNotEmpty(PaymentGatewayService::DRIVERS);

        foreach (PaymentGatewayService::DRIVERS as $provider => $driver) {
            $definition = $registry->get($provider);
            $this->assertSame('payments', $definition->category(), $provider);

            $required = array_column(array_filter($definition->schema(), fn (array $f): bool => $f['required'] === true), 'name');
            $this->assertNotEmpty($driver::CREDENTIAL_KEYS, $provider);
            foreach ($driver::CREDENTIAL_KEYS as $key) {
                $this->assertContains($key, $required, "{$provider} : `{$key}` est lu par le pilote, absent ou facultatif dans le schéma");
            }
        }
    }

    public function test_every_payment_driver_provider_is_registered(): void
    {
        $keys = app(IntegrationProviderRegistry::class)->keys();
        foreach (array_keys(PaymentGatewayService::DRIVERS) as $provider) {
            $this->assertContains($provider, $keys);
        }
    }
}
